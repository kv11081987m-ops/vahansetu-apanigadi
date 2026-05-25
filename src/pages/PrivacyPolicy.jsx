import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shield, MapPin, Phone, FileText, Bell, CreditCard, Trash2, Mail } from 'lucide-react';

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
        <Icon size={18} />
      </div>
      <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">{title}</h2>
    </div>
    <div className="text-[13px] text-slate-600 leading-relaxed space-y-2 font-medium">
      {children}
    </div>
  </div>
);

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState('hi');
  const isHindi = lang === 'hi';

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="text-sm font-bold">Back</span>
          </button>
          <h1 className="text-sm font-black text-slate-800 uppercase tracking-widest">Privacy Policy</h1>
          <button
            onClick={() => setLang(isHindi ? 'en' : 'hi')}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full"
          >
            {isHindi ? 'English' : 'हिंदी'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {/* Hero */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-8 text-white">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <Shield size={28} />
          </div>
          <h2 className="text-2xl font-black tracking-tight mb-2">VahanSetu<br />Privacy Policy</h2>
          {isHindi ? (
            <p className="text-blue-100 text-sm font-medium leading-relaxed">
              Aapki privacy hamari sabse badi zimmedari hai. Ye document batata hai ki hum kaunsa data collect karte hain, kyu karte hain, aur aapke kya rights hain.
            </p>
          ) : (
            <p className="text-blue-100 text-sm font-medium leading-relaxed">
              Your privacy is our biggest responsibility. This document explains what data we collect, why we collect it, and what rights you have.
            </p>
          )}
          <p className="text-blue-200 text-[11px] font-bold mt-4 uppercase tracking-widest">
            {isHindi ? 'Antim sudhar: May 2026' : 'Last updated: May 2026'}
          </p>
        </div>

        {/* Section 1 — Data Collected */}
        <Section icon={FileText} title={isHindi ? '1. Hum Kya Data Collect Karte Hain' : '1. What Data We Collect'}>
          {isHindi ? (
            <>
              <p><strong>Passengers ke liye:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Phone number (login ke liye)</li>
                <li>Naam (profile ke liye)</li>
                <li>Pickup aur destination location</li>
                <li>Ride history (booking records)</li>
                <li>Payment method (cash / online)</li>
                <li>Device notification token (ride alerts ke liye)</li>
              </ul>
              <p className="mt-3"><strong>Drivers ke liye (upar ke sab + additional):</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Real-time GPS location (jab online ho)</li>
                <li>Aadhar Card number</li>
                <li>Driving License number</li>
                <li>Vehicle RC number</li>
                <li>Aadhar aur vehicle ki photos (Cloudinary pe store hoti hain)</li>
                <li>Wallet balance aur earnings</li>
                <li>Driver rating aur reviews</li>
              </ul>
            </>
          ) : (
            <>
              <p><strong>For Passengers:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Phone number (for login)</li>
                <li>Name (for profile)</li>
                <li>Pickup and destination location</li>
                <li>Ride history (booking records)</li>
                <li>Payment method (cash / online)</li>
                <li>Device notification token (for ride alerts)</li>
              </ul>
              <p className="mt-3"><strong>For Drivers (above + additional):</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Real-time GPS location (when online)</li>
                <li>Aadhar Card number</li>
                <li>Driving License number</li>
                <li>Vehicle RC number</li>
                <li>Aadhar and vehicle photos (stored on Cloudinary)</li>
                <li>Wallet balance and earnings</li>
                <li>Driver rating and reviews</li>
              </ul>
            </>
          )}
        </Section>

        {/* Section 2 — Location */}
        <Section icon={MapPin} title={isHindi ? '2. Location Data Ka Upyog' : '2. Use of Location Data'}>
          {isHindi ? (
            <>
              <p>Hum aapki location sirf in zaruri kamon ke liye use karte hain:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Passengers:</strong> Pickup point set karne ke liye aur driver ko dikhane ke liye</li>
                <li><strong>Drivers:</strong> Nazdiki rides dikhane ke liye aur live tracking ke liye — <strong>sirf tab jab aap Online hain</strong></li>
              </ul>
              <p className="mt-2 text-slate-500">Hum aapki location background mein track nahi karte jab app band ho.</p>
            </>
          ) : (
            <>
              <p>We use your location only for these essential purposes:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Passengers:</strong> To set pickup point and show nearby drivers</li>
                <li><strong>Drivers:</strong> To show nearby rides and for live tracking — <strong>only when you are Online</strong></li>
              </ul>
              <p className="mt-2 text-slate-500">We do not track your location in the background when the app is closed.</p>
            </>
          )}
        </Section>

        {/* Section 3 — Phone */}
        <Section icon={Phone} title={isHindi ? '3. Phone Number Ka Upyog' : '3. Use of Phone Number'}>
          {isHindi ? (
            <>
              <p>Aapka phone number sirf <strong>Firebase Authentication</strong> ke through secure login ke liye use hota hai (OTP via SMS).</p>
              <p>Hum aapka phone number kabhi:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Kisi third party ko nahi bechte</li>
                <li>Marketing SMS nahi bhejte</li>
                <li>Bina permission ke share nahi karte</li>
              </ul>
              <p className="mt-2">Driver ka phone number passenger ko tab dikhaya jata hai jab ride accept ho — emergency contact ke liye.</p>
            </>
          ) : (
            <>
              <p>Your phone number is used only for secure login via <strong>Firebase Authentication</strong> (OTP via SMS).</p>
              <p>We never:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Sell your phone number to any third party</li>
                <li>Send marketing SMS</li>
                <li>Share it without permission</li>
              </ul>
              <p className="mt-2">Driver's phone number is shown to passenger after ride acceptance — for emergency contact only.</p>
            </>
          )}
        </Section>

        {/* Section 4 — Notifications */}
        <Section icon={Bell} title={isHindi ? '4. Push Notifications' : '4. Push Notifications'}>
          {isHindi ? (
            <>
              <p>Hum <strong>Firebase Cloud Messaging (FCM)</strong> use karte hain notifications ke liye:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Drivers ko naye ride requests ki notification</li>
                <li>Passengers ko driver acceptance ki notification</li>
                <li>Admin ke system announcements</li>
              </ul>
              <p className="mt-2">Aap notifications band kar sakte hain apne phone settings mein. Notifications band karne par aapko rides miss ho sakti hain.</p>
            </>
          ) : (
            <>
              <p>We use <strong>Firebase Cloud Messaging (FCM)</strong> for notifications:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>New ride request notifications for drivers</li>
                <li>Driver acceptance notifications for passengers</li>
                <li>Admin system announcements</li>
              </ul>
              <p className="mt-2">You can disable notifications from your phone settings. Disabling may cause you to miss ride requests.</p>
            </>
          )}
        </Section>

        {/* Section 5 — Payment */}
        <Section icon={CreditCard} title={isHindi ? '5. Payment Data' : '5. Payment Data'}>
          {isHindi ? (
            <>
              <p>VahanSetu abhi do payment methods support karta hai:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Cash:</strong> Sirf transaction record store hota hai (amount, date)</li>
                <li><strong>Online:</strong> Payment sirf hum process karte hain — card details hamare paas store nahi hoti</li>
              </ul>
              <p className="mt-2">Saari financial records <strong>Google Firebase Firestore</strong> mein encrypted store hoti hain.</p>
            </>
          ) : (
            <>
              <p>VahanSetu currently supports two payment methods:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Cash:</strong> Only the transaction record is stored (amount, date)</li>
                <li><strong>Online:</strong> We only process the payment — card details are never stored by us</li>
              </ul>
              <p className="mt-2">All financial records are stored encrypted in <strong>Google Firebase Firestore</strong>.</p>
            </>
          )}
        </Section>

        {/* Section 6 — Third Party */}
        <Section icon={Shield} title={isHindi ? '6. Third-Party Services' : '6. Third-Party Services'}>
          {isHindi ? (
            <div className="space-y-3">
              <p>Hum ye trusted services use karte hain:</p>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
                {[
                  { name: 'Google Firebase', use: 'Authentication, Database, Push Notifications' },
                  { name: 'Google Maps', use: 'Maps, route calculation, location search' },
                  { name: 'Cloudinary', use: 'Driver KYC document photos store karna' },
                ].map(s => (
                  <div key={s.name} className="flex gap-3">
                    <span className="text-blue-600 font-black shrink-0">•</span>
                    <div>
                      <span className="font-black text-slate-700">{s.name}</span>
                      <span className="text-slate-500"> — {s.use}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-[12px]">In services ki apni privacy policies hain jo unki websites pe available hain.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p>We use these trusted services:</p>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
                {[
                  { name: 'Google Firebase', use: 'Authentication, Database, Push Notifications' },
                  { name: 'Google Maps', use: 'Maps, route calculation, location search' },
                  { name: 'Cloudinary', use: 'Storing driver KYC document photos' },
                ].map(s => (
                  <div key={s.name} className="flex gap-3">
                    <span className="text-blue-600 font-black shrink-0">•</span>
                    <div>
                      <span className="font-black text-slate-700">{s.name}</span>
                      <span className="text-slate-500"> — {s.use}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-[12px]">Each of these services has its own privacy policy available on their websites.</p>
            </div>
          )}
        </Section>

        {/* Section 7 — User Rights */}
        <Section icon={Trash2} title={isHindi ? '7. Aapke Rights' : '7. Your Rights'}>
          {isHindi ? (
            <>
              <p>Aap kabhi bhi ye kar sakte hain:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Data dekhna:</strong> Apna profile aur ride history app mein dekh sakte hain</li>
                <li><strong>Data delete karna:</strong> Account delete karne ki request neeche diye email pe bhejein</li>
                <li><strong>Data correct karna:</strong> Profile mein naam update kar sakte hain</li>
                <li><strong>Notification band karna:</strong> Phone settings se kisi bhi waqt</li>
              </ul>
              <p className="mt-2 text-slate-500">Account delete hone par aapka saara data 30 din ke andar permanently delete kar diya jaayega.</p>
            </>
          ) : (
            <>
              <p>You can at any time:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>View your data:</strong> See your profile and ride history in the app</li>
                <li><strong>Delete your data:</strong> Send a deletion request to the email below</li>
                <li><strong>Correct your data:</strong> Update your name in the profile</li>
                <li><strong>Disable notifications:</strong> From phone settings at any time</li>
              </ul>
              <p className="mt-2 text-slate-500">Upon account deletion, all your data will be permanently deleted within 30 days.</p>
            </>
          )}
        </Section>

        {/* Contact */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white">
          <div className="flex items-center gap-3 mb-3">
            <Mail size={18} className="text-blue-400" />
            <h2 className="text-sm font-black uppercase tracking-wide">
              {isHindi ? 'Hamare Se Sampark Karein' : 'Contact Us'}
            </h2>
          </div>
          <p className="text-slate-400 text-[13px] font-medium leading-relaxed">
            {isHindi
              ? 'Privacy se related koi bhi sawaal ya data delete request ke liye:'
              : 'For any privacy-related questions or data deletion requests:'}
          </p>
          <p className="text-white font-black text-sm mt-2">support@vahansetu.in</p>
          <p className="text-slate-400 text-[11px] mt-1 font-medium">
            VahanSetu ApniGadi — Deoria, Uttar Pradesh, India
          </p>
        </div>

        <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] py-4">
          © 2026 VahanSetu ApniGadi. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
