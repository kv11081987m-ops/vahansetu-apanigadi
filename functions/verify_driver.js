const admin = require('firebase-admin');

admin.initializeApp({ projectId: 'vahansetuapnigadi' });
const db = admin.firestore();

async function verifyDriver() {
  const phone = process.argv[2];
  if (!phone) { console.error('Usage: node verify_driver.js +91XXXXXXXXXX'); process.exit(1); }
  const snap = await db.collection('drivers').where('phone', '==', phone).limit(1).get();

  if (snap.empty) {
    console.log('Driver not found with phone:', phone);
    return;
  }

  const driverDoc = snap.docs[0];
  await driverDoc.ref.update({
    verificationStatus: 'verified',
    isOnline: false
  });

  console.log('Driver verified:', driverDoc.id, driverDoc.data().name);
}

verifyDriver().catch(console.error).finally(() => process.exit(0));
