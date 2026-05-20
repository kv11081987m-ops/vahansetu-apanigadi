import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FileText, Users, Car, CreditCard, Ban, AlertTriangle, RefreshCw, Mail } from 'lucide-react';

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

const TermsOfService = () => {
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
          <h1 className="text-sm font-black text-slate-800 uppercase tracking-widest">Terms of Service</h1>
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
        <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-3xl p-8 text-white">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
            <FileText size={28} />
          </div>
          <h2 className="text-2xl font-black tracking-tight mb-2">VahanSetu<br />Terms of Service</h2>
          {isHindi ? (
            <p className="text-slate-300 text-sm font-medium leading-relaxed">
              VahanSetu ApniGadi use karne se pehle yeh niyam padh lein. App use karna matalab aap in niyamon se sahmat hain.
            </p>
          ) : (
            <p className="text-slate-300 text-sm font-medium leading-relaxed">
              Please read these terms before using VahanSetu ApniGadi. Using the app means you agree to these terms.
            </p>
          )}
          <p className="text-slate-400 text-[11px] font-bold mt-4 uppercase tracking-widest">
            {isHindi ? 'Antim sudhar: May 2026' : 'Last updated: May 2026'}
          </p>
        </div>

        {/* Section 1 — Service Description */}
        <Section icon={Car} title={isHindi ? '1. Hamare Baare Mein' : '1. About Our Service'}>
          {isHindi ? (
            <>
              <p>VahanSetu ApniGadi ek local ride-hailing platform hai jo Deoria, Uttar Pradesh mein battery rickshaw aur chhota hathi (logistics) ki booking ki suvidha deta hai.</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Hum sirf <strong>technology platform</strong> hain — driver aur passenger ko connect karte hain</li>
                <li>Drivers independent hain — VahanSetu ke employee nahi hain</li>
                <li>Ride ki quality aur safety ke liye drivers ki khud zimmedari hai</li>
              </ul>
            </>
          ) : (
            <>
              <p>VahanSetu ApniGadi is a local ride-hailing platform providing battery rickshaw and chhota hathi (logistics) bookings in Deoria, Uttar Pradesh.</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>We are a <strong>technology platform only</strong> — we connect drivers and passengers</li>
                <li>Drivers are independent — not employees of VahanSetu</li>
                <li>Drivers are responsible for ride quality and safety</li>
              </ul>
            </>
          )}
        </Section>

        {/* Section 2 — Eligibility */}
        <Section icon={Users} title={isHindi ? '2. Kaun Use Kar Sakta Hai' : '2. Eligibility'}>
          {isHindi ? (
            <>
              <p>App use karne ke liye aapko yeh conditions poori karni hongi:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Umar <strong>18 saal ya usse zyada</strong> honi chahiye</li>
                <li>Valid Indian phone number hona zaroori hai</li>
                <li>Drivers ke liye: valid driving license aur registered vehicle</li>
                <li>Drivers ke liye: Aadhar card (KYC verification ke liye)</li>
              </ul>
              <p className="mt-2 text-slate-500">Galat information dene par account turant band kiya ja sakta hai.</p>
            </>
          ) : (
            <>
              <p>To use the app, you must meet these conditions:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Age must be <strong>18 years or above</strong></li>
                <li>Must have a valid Indian phone number</li>
                <li>For drivers: valid driving license and registered vehicle</li>
                <li>For drivers: Aadhar card (for KYC verification)</li>
              </ul>
              <p className="mt-2 text-slate-500">Providing false information may result in immediate account suspension.</p>
            </>
          )}
        </Section>

        {/* Section 3 — Passenger Rules */}
        <Section icon={Users} title={isHindi ? '3. Passenger Ki Zimmedari' : '3. Passenger Responsibilities'}>
          {isHindi ? (
            <>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Sahi pickup aur destination location dena</li>
                <li>Driver ke saath izzat se pesh aana</li>
                <li>Agreed fare ya cash amount samay par ada karna</li>
                <li>Ride cancel karne se pehle driver ko inform karna</li>
                <li>Kisi bhi illegal kaam ke liye ride book nahi karna</li>
                <li>Apna OTP sirf apne driver ko hi batana</li>
              </ul>
              <p className="mt-2 text-slate-500">Baar baar fake bookings karne par account permanently block ho sakta hai.</p>
            </>
          ) : (
            <>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Provide accurate pickup and destination location</li>
                <li>Treat the driver with respect</li>
                <li>Pay the agreed fare or cash amount on time</li>
                <li>Inform the driver before cancelling a ride</li>
                <li>Not book rides for any illegal activity</li>
                <li>Share your OTP only with your driver</li>
              </ul>
              <p className="mt-2 text-slate-500">Repeated fake bookings may result in permanent account block.</p>
            </>
          )}
        </Section>

        {/* Section 4 — Driver Rules */}
        <Section icon={Car} title={isHindi ? '4. Driver Ki Zimmedari' : '4. Driver Responsibilities'}>
          {isHindi ? (
            <>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Valid license aur registered vehicle se hi ride karna</li>
                <li>Passenger ke saath izzat se pesh aana</li>
                <li>Sirf confirmed OTP ke baad ride start karna</li>
                <li>Agreed route pe chalna — unnecessarily lambi route nahi lena</li>
                <li>Platform ke commission niyamon ka paalan karna</li>
                <li>Kisi bhi legal complaint ki zimmedari khud lena</li>
              </ul>
              <p className="mt-2 text-slate-500">Fraud ya passenger complaints par account suspend ya permanently ban ho sakta hai.</p>
            </>
          ) : (
            <>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Ride only with a valid license and registered vehicle</li>
                <li>Treat passengers with respect</li>
                <li>Start ride only after confirming OTP</li>
                <li>Follow the agreed route — do not take unnecessarily long routes</li>
                <li>Follow platform commission rules</li>
                <li>Be personally responsible for any legal complaints</li>
              </ul>
              <p className="mt-2 text-slate-500">Fraud or passenger complaints may result in account suspension or permanent ban.</p>
            </>
          )}
        </Section>

        {/* Section 5 — Payments */}
        <Section icon={CreditCard} title={isHindi ? '5. Payment Aur Fare' : '5. Payment & Fare'}>
          {isHindi ? (
            <>
              <p><strong>Fare calculation:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Battery Rickshaw: ₹20 base + ₹8/km</li>
                <li>Chhota Hathi: ₹150 base + ₹20/km</li>
                <li>Raat ka time (10 PM – 6 AM): extra surcharge lag sakta hai</li>
              </ul>
              <p className="mt-3"><strong>Driver commission:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Cash rides: 8% platform fee driver ke wallet se deduct hota hai</li>
                <li>Ek baar deducted commission refund nahi hoga</li>
              </ul>
              <p className="mt-2 text-slate-500">Fare app mein calculated hota hai — driver khud fare nahi bada sakta.</p>
            </>
          ) : (
            <>
              <p><strong>Fare calculation:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Battery Rickshaw: ₹20 base + ₹8/km</li>
                <li>Chhota Hathi: ₹150 base + ₹20/km</li>
                <li>Night hours (10 PM – 6 AM): additional surcharge may apply</li>
              </ul>
              <p className="mt-3"><strong>Driver commission:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Cash rides: 8% platform fee is deducted from driver's wallet</li>
                <li>Deducted commission is non-refundable</li>
              </ul>
              <p className="mt-2 text-slate-500">Fare is calculated by the app — drivers cannot increase the fare on their own.</p>
            </>
          )}
        </Section>

        {/* Section 6 — Prohibited Conduct */}
        <Section icon={Ban} title={isHindi ? '6. Mana Ki Gayi Harkaten' : '6. Prohibited Conduct'}>
          {isHindi ? (
            <>
              <p>Yeh kaam bilkul mana hain — account turant ban hoga:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Fake ya fraud ride requests banana</li>
                <li>Kisi bhi user ko harass, threaten ya abuse karna</li>
                <li>Platform ke data ko hack ya misuse karna</li>
                <li>Doosre users ka account use karna</li>
                <li>Galat phone number ya documents dena</li>
                <li>Illegal goods ya substances ka transport karna</li>
              </ul>
            </>
          ) : (
            <>
              <p>These actions are strictly prohibited — account will be immediately banned:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Creating fake or fraudulent ride requests</li>
                <li>Harassing, threatening, or abusing any user</li>
                <li>Hacking or misusing platform data</li>
                <li>Using another user's account</li>
                <li>Providing false phone numbers or documents</li>
                <li>Transporting illegal goods or substances</li>
              </ul>
            </>
          )}
        </Section>

        {/* Section 7 — Liability */}
        <Section icon={AlertTriangle} title={isHindi ? '7. Hamaari Zimmedari Ki Seema' : '7. Limitation of Liability'}>
          {isHindi ? (
            <>
              <p>VahanSetu zimmedar nahi hai:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Ride ke dauran kisi bhi accident ya injury ke liye</li>
                <li>Driver ki deri ya ride cancel karne ke liye</li>
                <li>Passenger ya driver ke beech kisi bhi vivad ke liye</li>
                <li>Internet ya GPS failure ki wajah se booking problem ke liye</li>
              </ul>
              <p className="mt-2">Hum problems report karne ke liye available hain — <strong>support@vahansetu.in</strong> pe contact karein.</p>
            </>
          ) : (
            <>
              <p>VahanSetu is not liable for:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Any accident or injury during a ride</li>
                <li>Driver delays or ride cancellations</li>
                <li>Any dispute between passenger and driver</li>
                <li>Booking issues due to internet or GPS failure</li>
              </ul>
              <p className="mt-2">We are available to help report problems — contact us at <strong>support@vahansetu.in</strong>.</p>
            </>
          )}
        </Section>

        {/* Section 8 — Changes */}
        <Section icon={RefreshCw} title={isHindi ? '8. Niyamon Mein Badlav' : '8. Changes to Terms'}>
          {isHindi ? (
            <>
              <p>VahanSetu kabhi bhi in niyamon ko bina pehle notice ke badal sakta hai.</p>
              <p>Badlav hone par app mein update ki date change ho jaayegi. App ka continued use matalab aap naye niyamon se sahmat hain.</p>
              <p className="text-slate-500">Agar aap naye niyamon se sahmat nahi hain, to app use karna band kar dein aur account delete request bhejein.</p>
            </>
          ) : (
            <>
              <p>VahanSetu may change these terms at any time without prior notice.</p>
              <p>When changes occur, the update date in the app will change. Continued use of the app means you agree to the new terms.</p>
              <p className="text-slate-500">If you do not agree with the new terms, stop using the app and send an account deletion request.</p>
            </>
          )}
        </Section>

        {/* Section — Data Privacy */}
        <Section icon={Mail} title={isHindi ? '9. Data Collection & Privacy' : '9. Data Collection & Privacy'}>
          {isHindi ? (
            <>
              <p><strong>Hum yeh data collect karte hain:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Phone number (login ke liye)</li>
                <li>Location (ride booking aur driver matching ke liye)</li>
                <li>Ride history (service improvement ke liye)</li>
              </ul>
              <p className="mt-2"><strong>Data kahan store hota hai:</strong> Firebase (Google servers, India/USA region)</p>
              <p className="mt-2 text-slate-500">Hum aapka data kisi third party ko nahi bechte.</p>
            </>
          ) : (
            <>
              <p><strong>We collect the following data:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Phone number (for login)</li>
                <li>Location (for ride booking and driver matching)</li>
                <li>Ride history (for service improvement)</li>
              </ul>
              <p className="mt-2"><strong>Data storage:</strong> Firebase (Google servers, India/USA region)</p>
              <p className="mt-2 text-slate-500">We do not sell your data to any third party.</p>
            </>
          )}
        </Section>

        {/* Contact / Grievance */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white">
          <div className="flex items-center gap-3 mb-3">
            <Mail size={18} className="text-blue-400" />
            <h2 className="text-sm font-black uppercase tracking-wide">
              {isHindi ? 'Grievance Contact / Hamare Se Sampark Karein' : 'Grievance Contact'}
            </h2>
          </div>
          <p className="text-slate-400 text-[13px] font-medium leading-relaxed">
            {isHindi
              ? 'Terms se related koi sawaal ya complaint ke liye (24-48 ghante mein jawab):'
              : 'For any questions or complaints (response within 24-48 hours):'}
          </p>
          <p className="text-white font-black text-sm mt-3">apnigadivahansetu@gmail.com</p>
          <p className="text-blue-300 font-black text-sm mt-1">+91 7529938896</p>
          <p className="text-slate-400 text-[11px] mt-2 font-medium">
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

export default TermsOfService;
