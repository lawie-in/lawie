import WaitlistForm from './WaitlistForm';

export default function FinalCTA() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          Ready to stop wasting time on formats?
        </h2>
        <p className="mt-4 text-lg text-slate-500">
          Join thousands of young advocates who are drafting smarter.
        </p>

        <div className="mt-10">
          <WaitlistForm ctaText="Join the waitlist — It's free" />
        </div>
      </div>
    </section>
  );
}
