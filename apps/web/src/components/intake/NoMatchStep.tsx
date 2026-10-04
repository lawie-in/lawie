'use client';

/**
 * 08 No template match — T-103, design T-005 §5 "08".
 * Friendly, no error colour, no blame. The user's text is echoed and kept.
 * Until T-105 ships, `outcome: guided` also lands here.
 */
export default function NoMatchStep({
  description,
  onEditDescription,
  onBrowse,
}: {
  description: string;
  onEditDescription: () => void;
  onBrowse: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="font-heading text-brand-navy text-[26px] font-semibold leading-8 sm:text-[34px] sm:leading-[42px]">
        We could not find a ready document for this
      </h1>
      <p className="text-brand-muted mt-2 text-base">
        That happens with less common requests. You can add a few details and try again, or look
        through all documents yourself.
      </p>

      <figure className="border-brand-line mt-6 rounded-xl border bg-white p-4">
        <figcaption className="text-brand-navy text-sm font-medium">Your description</figcaption>
        <blockquote className="text-brand-navy mt-2 whitespace-pre-wrap break-words text-base">
          {description}
        </blockquote>
      </figure>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onBrowse}
          className="border-brand-line text-brand-teal-dark focus-visible:ring-brand-teal inline-flex min-h-[48px] items-center justify-center rounded-lg border bg-white px-6 text-base font-medium focus:outline-none focus-visible:ring-2"
        >
          Browse templates
        </button>
        <button
          type="button"
          onClick={onEditDescription}
          className="bg-brand-navy focus-visible:ring-brand-teal inline-flex min-h-[48px] items-center justify-center rounded-lg px-6 text-base font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Edit my description
        </button>
      </div>
    </div>
  );
}
