'use client';

import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import type { Node as PmNode } from '@tiptap/pm/model';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef } from 'react';

import {
  SECTION_FINDER_INSERT_EVENT,
  SECTION_FINDER_OPEN_EVENT,
} from '../sections/SectionFinderPanel';

import {
  EXPORT_BLANKS_GO_BACK_EVENT,
  findBlanks,
  type ExportBlanksGoBackDetail,
} from './exportUtils';
import Toolbar from './Toolbar';

interface DocumentEditorProps {
  initialContent: string;
  onUpdate: (html: string) => void;
  editable?: boolean;
}

/**
 * Convert plain text (from AI generation) to simple HTML for TipTap.
 * Wraps each paragraph in <p> tags, preserves double newlines as paragraph breaks.
 * T-274: content that starts with '<' after leading whitespace is already HTML
 * (as shared projectContent and exportUtils' isPlainContent read it). Plain
 * text has CRLF/CR line ends made LF, then is HTML-escaped, then gets its tags,
 * so a '<', '>' or '&' in the draft shows as written. exportUtils'
 * plainTextToHtml mirrors this (keep the two in step).
 */
function escapePlainText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToHtml(text: string): string {
  if (text.trimStart().startsWith('<')) return text; // already HTML
  return escapePlainText(text.replace(/\r\n?/g, '\n'))
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * T-194: the editor's text exactly as the export's `blankText` reads the
 * editor's HTML, with the document position of each character. `blankText`
 * gives a "\n" for every opening and every closing block tag and one for a
 * <br> or <hr>. So here each block with content gives a "\n" where it opens
 * and one where it closes (two between paragraphs, the empty line `findBlanks`
 * reads as a paragraph break), and a hard break or a leaf block gives one.
 * The editor and the export then see the same paragraphs, and the same blanks.
 */
function textWithPositions(doc: PmNode): { text: string; positions: number[] } {
  const chars: string[] = [];
  const positions: number[] = [];
  const push = (ch: string, pos: number) => {
    chars.push(ch);
    positions.push(pos);
  };
  // `contentStart` is the document position of the parent's first child.
  const walk = (parent: PmNode, contentStart: number) => {
    parent.forEach((child, offset) => {
      const pos = contentStart + offset;
      if (child.isText) {
        const t = child.text ?? '';
        for (let i = 0; i < t.length; i++) push(t[i], pos + i);
      } else if (child.type.name === 'hardBreak') {
        push('\n', pos);
      } else if (child.isBlock && child.isLeaf) {
        push('\n', pos);
      } else if (child.isBlock) {
        push('\n', pos);
        walk(child, pos + 1);
        push('\n', pos + child.nodeSize - 1);
      } else {
        walk(child, pos + 1);
      }
    });
  };
  walk(doc, 0);
  return { text: chars.join(''), positions };
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
        // T-138: narrower paper margins below md, so the text column is wide enough to read.
        class:
          'px-4 py-6 lg:px-16 lg:py-12 min-h-[842px] focus:outline-none text-sm leading-relaxed text-slate-800',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onUpdateRef.current(ed.getHTML());
    },
  });

  // Sync editable prop. T-152: emitUpdate=false — TipTap's setEditable emits an "update" by
  // default, which fired onUpdate (and so an autosave and a new version) every time a draft
  // was opened.
  useEffect(() => {
    if (editor) editor.setEditable(editable, false);
  }, [editor, editable]);

  // SCRUM-83: listen for the Section Finder's "insert at cursor" event and
  // splice the citation into the editor at the current selection. The
  // wrapper span carries:
  //   - .lawie-citation                  → permanent style (subtle pill + click)
  //   - .lawie-citation-fresh            → 2s amber flash on insert (auto-stripped)
  //   - data-lawie-citation="CODE:SEC"   → re-open the finder with this section
  // (see globals.css for both styles).
  useEffect(() => {
    if (!editor) return;
    function handler(e: Event) {
      const ce = e as CustomEvent<{ citation: string; section: string; code: string }>;
      const text = ce.detail?.citation;
      const code = ce.detail?.code;
      const section = ce.detail?.section;
      if (!text || !code || !section) return;
      const payload = `${code}:${section}`;
      editor!
        .chain()
        .focus()
        .insertContent(
          `<span class="lawie-citation lawie-citation-fresh" data-lawie-citation="${payload}">${text}</span>&nbsp;`,
        )
        .run();
      // Strip the highlight class after 2s so the amber flash doesn't persist
      // in the saved doc. The permanent .lawie-citation class stays.
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

  // T-194 "Go back and fill": put the cursor at the start of the first blank in
  // document order and scroll it to the middle of the view. The editor finds
  // the blank in its own text with the same findBlanks the export uses, so a
  // blank shown here as {{MISSING: label}} is found as well.
  useEffect(() => {
    if (!editor) return;
    function handler(e: Event) {
      const detail = (e as CustomEvent<ExportBlanksGoBackDetail>).detail;
      const { text, positions } = textWithPositions(editor!.state.doc);
      let at = findBlanks(text)[0]?.start ?? -1;
      if (at < 0 && detail?.text) at = text.indexOf(detail.text);
      if (at < 0 || positions[at] === undefined) {
        editor!.commands.focus();
        return;
      }
      const pos = positions[at];
      editor!.chain().focus().setTextSelection(pos).run();
      const { node } = editor!.view.domAtPos(pos);
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
      el?.scrollIntoView({ block: 'center' });
    }
    window.addEventListener(EXPORT_BLANKS_GO_BACK_EVENT, handler);
    return () => window.removeEventListener(EXPORT_BLANKS_GO_BACK_EVENT, handler);
  }, [editor]);

  // SCRUM-83 polish: clicking an inserted citation pill re-opens the panel
  // with that section pre-loaded into the result card. Listens at the editor
  // root via delegation so we catch clicks no matter how the user formats /
  // reflows the surrounding paragraph.
  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;
    function handleClick(e: Event) {
      const target = e.target as HTMLElement | null;
      const pill = target?.closest?.('[data-lawie-citation]') as HTMLElement | null;
      if (!pill) return;
      const payload = pill.dataset.lawieCitation;
      if (!payload) return;
      const [code, section] = payload.split(':');
      if (!code || !section) return;
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent(SECTION_FINDER_OPEN_EVENT, {
          detail: { preload: { code, section } },
        }),
      );
    }
    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
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
      {/* Paper canvas — A4-like proportions. From md it scrolls on its own; below md it is as
          tall as the draft and the page scrolls (T-138). */}
      <div className="overflow-y-auto bg-slate-100 p-2 lg:min-h-0 lg:flex-1 lg:p-6">
        <div className="mx-auto max-w-[210mm] bg-white shadow-md">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
