// runtime: nodejs22
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

/**
 * Triggers when a new ride_request is created.
 * If it's a broadcast ride, pushes FCM notification to all matching online drivers.
 */
exports.notifyDriversOnRide = onDocumentCreated(
  { document: 'ride_requests/{rideId}', region: 'asia-south1' },
  async (event) => {
    const ride = event.data.data();
    const rideId = event.params.rideId;

    // Only notify for broadcast rides
    if (ride.driverId !== 'broadcast') return;

    const vehicleType = ride.vehicleType;
    const pickupAddress = ride.pickup?.address || 'Nai jagah';
    const fare = ride.fareAmount || ride.fare || '?';

    // Fetch all online drivers with matching vehicle type
    const driversSnap = await db.collection('drivers')
      .where('isOnline', '==', true)
      .where('vehicleType', '==', vehicleType)
      .get();

    // Keep token+ref together so stale-token cleanup maps to the correct driver
    const driverTargets = driversSnap.docs
      .map(d => ({ ref: d.ref, token: d.data().fcmToken }))
      .filter(d => Boolean(d.token));

    if (driverTargets.length === 0) {
      console.log(`[FCM] No drivers with FCM tokens for vehicleType=${vehicleType}`);
      return;
    }

    const vehicleLabel = vehicleType === 'battery_rickshaw' ? 'Savaari' : 'Logistics';
    const message = {
      notification: {
        title: `🛺 Naya ${vehicleLabel} Request!`,
        body: `Pickup: ${pickupAddress} | Fare: ₹${fare}`
      },
      data: {
        rideId,
        vehicleType,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'ride_requests', defaultVibrateTimings: true }
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } }
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { requireInteraction: true, vibrate: [500, 200, 500, 200, 500] }
      },
      tokens: driverTargets.map(d => d.token)
    };

    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`[FCM] Sent to ${driverTargets.length} drivers. Success: ${response.successCount}, Fail: ${response.failureCount}`);

    // Clean up stale tokens — idx aligns with driverTargets (both filtered)
    const staleTokenUpdates = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
        staleTokenUpdates.push(driverTargets[idx].ref.update({ fcmToken: null }));
      }
    });
    if (staleTokenUpdates.length) await Promise.all(staleTokenUpdates);
  }
);

/**
 * Runs every 15 minutes. Activates scheduled rides whose scheduledAt
 * falls within the next 20 minutes — converts them to 'pending' and
 * sends FCM notifications to matching online drivers.
 */
exports.processScheduledRides = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-south1' },
  async () => {
    const now = new Date();
    const activateWindow = new Date(now.getTime() + 20 * 60 * 1000);

    const snap = await db.collection('ride_requests')
      .where('status', '==', 'scheduled')
      .where('scheduledAt', '<=', Timestamp.fromDate(activateWindow))
      .get();

    if (snap.empty) {
      console.log('[Scheduler] No rides to activate');
      return;
    }

    for (const docSnap of snap.docs) {
      const ride = docSnap.data();
      const scheduledMs = ride.scheduledAt?.toMillis?.() || 0;

      // Already past — mark expired
      if (scheduledMs < now.getTime()) {
        await docSnap.ref.update({ status: 'expired' });
        console.log(`[Scheduler] Ride ${docSnap.id} expired`);
        continue;
      }

      // Activate: convert to pending broadcast
      await docSnap.ref.update({ status: 'pending', driverId: 'broadcast' });
      console.log(`[Scheduler] Activated ride ${docSnap.id}`);

      // Notify matching online drivers
      const driversSnap = await db.collection('drivers')
        .where('isOnline', '==', true)
        .where('vehicleType', '==', ride.vehicleType)
        .get();

      const tokens = driversSnap.docs.map(d => d.data().fcmToken).filter(Boolean);
      if (tokens.length === 0) continue;

      const vehicleLabel = ride.vehicleType === 'battery_rickshaw' ? 'Savaari' : 'Logistics';
      const schedTime = ride.scheduledAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

      await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: `⏰ Scheduled ${vehicleLabel} Ride Ready!`,
          body: `${schedTime} — Pickup: ${ride.pickup?.address || 'Location'} | ₹${ride.fareAmount || ride.fare || '?'}`
        },
        data: { rideId: docSnap.id },
        android: { priority: 'high', notification: { sound: 'default', channelId: 'ride_requests' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } }
      });
    }

    console.log(`[Scheduler] Processed ${snap.size} scheduled rides`);
  }
);

/**
 * Triggers when a ride_request is updated.
 * On first payment_done ride of a referred user, credits both referrer and referee.
 */
exports.processReferralReward = onDocumentUpdated(
  { document: 'ride_requests/{rideId}', region: 'asia-south1' },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Only act when status changes TO payment_done
    if (before.status === after.status) return;
    if (after.status !== 'payment_done') return;

    const userId = after.userId;
    if (!userId) return;

    // Check for a pending referral where this user is the referee
    const referralSnap = await db.collection('referrals')
      .where('refereeId', '==', userId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (referralSnap.empty) return;

    // Check if this is the user's FIRST paid ride
    const paidRidesSnap = await db.collection('ride_requests')
      .where('userId', '==', userId)
      .where('status', '==', 'payment_done')
      .limit(2)
      .get();

    // If more than 1 payment_done ride, not the first — skip
    if (paidRidesSnap.size > 1) return;

    // Read platform config for reward amounts
    const configSnap = await db.collection('config').doc('platform').get();
    const config = configSnap.exists ? configSnap.data() : {};
    const referrerReward = config.referralReferrerReward || 20;
    const refereeReward = config.referralRefereeReward || 25;

    const referralDoc = referralSnap.docs[0];
    const referral = referralDoc.data();
    const referrerId = referral.referrerId;

    console.log(`[Referral] Rewarding: referrer=${referrerId} +₹${referrerReward}, referee=${userId} +₹${refereeReward}`);

    // Atomic: re-read referral status inside transaction to prevent double-credit
    // on concurrent payment_done triggers (retry / race condition).
    try {
      await db.runTransaction(async (txn) => {
        const referralLive = await txn.get(referralDoc.ref);
        if (!referralLive.exists || referralLive.data().status !== 'pending') {
          throw new Error('already_rewarded');
        }
        txn.update(referralDoc.ref, {
          status: 'rewarded',
          rewardedAt: FieldValue.serverTimestamp(),
          referrerReward,
          refereeReward,
        });
        txn.update(db.collection('users').doc(referrerId), {
          balance: FieldValue.increment(referrerReward),
        });
        txn.update(db.collection('users').doc(userId), {
          balance: FieldValue.increment(refereeReward),
        });
      });
    } catch (e) {
      if (e.message === 'already_rewarded') {
        console.log(`[Referral] Skipped — referral ${referralDoc.id} already rewarded (race condition caught).`);
        return;
      }
      throw e;
    }

    // Also credit driver wallet if referrer is a driver (non-critical, best-effort)
    try {
      const driverSnap = await db.collection('drivers').doc(referrerId).get();
      if (driverSnap.exists) {
        await driverSnap.ref.update({ walletBalance: FieldValue.increment(referrerReward) });
      }
    } catch (e) {
      console.error('[Referral] Driver wallet credit error:', e);
    }

    console.log(`[Referral] Reward complete for referral ${referralDoc.id}`);
  }
);
