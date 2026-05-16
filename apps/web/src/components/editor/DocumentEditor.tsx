'use client';

import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef } from 'react';

import { SECTION_FINDER_INSERT_EVENT } from '../sections/SectionFinderPanel';

import Toolbar from './Toolbar';

interface DocumentEditorProps {
  initialContent: string;
  onUpdate: (html: string) => void;
  editable?: boolean;
}

/**
 * Convert plain text (from AI generation) to simple HTML for TipTap.
 * Wraps each paragraph in <p> tags, preserves double newlines as paragraph breaks.
 */
function textToHtml(text: string): string {
  if (text.startsWith('<')) return text; // already HTML
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export default function DocumentEditor({
  initialContent,
  onUpdate,
  editable = true,
}: DocumentEditorProps) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: 'Start editing your document…',
      }),
    ],
    content: textToHtml(initialContent),
    editable,
    editorProps: {
      attributes: {
        class:
          'px-16 py-12 min-h-[842px] focus:outline-none text-sm leading-relaxed text-slate-800',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onUpdateRef.current(ed.getHTML());
    },
  });

  // Sync editable prop
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  // SCRUM-83: listen for the Section Finder's "insert at cursor" event and
  // splice the citation into the editor at the current selection. The freshly-
  // inserted span carries .lawie-citation-fresh so the editor styles can flash
  // it amber for 2s (see globals.css).
  useEffect(() => {
    if (!editor) return;
    function handler(e: Event) {
      const ce = e as CustomEvent<{ citation: string; section: string; code: string }>;
      const text = ce.detail?.citation;
      if (!text) return;
      editor!
        .chain()
        .focus()
        .insertContent(`<span class="lawie-citation-fresh">${text}</span>&nbsp;`)
        .run();
      // Strip the highlight class after 2s so it doesn't persist in the saved doc.
      setTimeout(() => {
        const root = editor!.view.dom;
        root.querySelectorAll('.lawie-citation-fresh').forEach((el) => {
          el.classList.remove('lawie-citation-fresh');
        });
      }, 2000);
    }
    window.addEventListener(SECTION_FINDER_INSERT_EVENT, handler);
    return () => window.removeEventListener(SECTION_FINDER_INSERT_EVENT, handler);
  }, [editor]);

  const getHtml = useCallback(() => {
    return editor?.getHTML() ?? '';
  }, [editor]);

  // Expose getHtml on the DOM node so parent can access it for export
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as HTMLDivElement & { getEditorHtml?: () => string }).getEditorHtml =
        getHtml;
    }
  }, [getHtml]);

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <Toolbar editor={editor} />
      {/* Paper canvas — A4-like proportions, scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-6">
        <div className="mx-auto max-w-[210mm] bg-white shadow-md">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
