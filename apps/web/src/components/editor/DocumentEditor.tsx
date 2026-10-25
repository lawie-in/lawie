'use client';

import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import type { Node as PmNode } from '@tiptap/pm/model';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import {
  SECTION_FINDER_INSERT_EVENT,
  SECTION_FINDER_OPEN_EVENT,
} from '../sections/SectionFinderPanel';
import { usePrefersReducedMotion } from '../ui/motion';

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
  /**
   * T-578: the page's save state. Shown in the toolbar while focus mode is open, so autosave is
   * never hidden (the page's own copy is under the layer).
   */
  saveState?: ReactNode;
  /**
   * T-578: the line pinned to the bottom of the focus-mode layer. The page passes the same
   * T-197 disclaimer text it shows above the editor; drop the prop to drop the second copy.
   */
  focusFooter?: string | null;
  /** T-578: told when focus mode opens and closes (the page moves its save state). */
  onFocusModeChange?: (open: boolean) => void;
}

/** T-578: the layer's fade, in and out (design note §3). None under reduced motion. */
const FOCUS_FADE_MS = 150;

/** T-578: what Tab can reach inside the focus-mode layer (the editor is contenteditable). */
const LAYER_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

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
  saveState,
  focusFooter,
  onFocusModeChange,
}: DocumentEditorProps) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // T-578 focus mode. Only the container's classes change: the Tiptap instance and its DOM are
  // never remounted, so unsaved edits, undo history and the page's autosave carry on as they are.
  const [focusMode, setFocusMode] = useState(false);
  // 'in' while the layer fades in, 'out' while it fades out before the classes go back.
  const [fade, setFade] = useState<'in' | 'out' | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const focusToggleRef = useRef<HTMLButtonElement>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFocusModeChangeRef = useRef(onFocusModeChange);
  onFocusModeChangeRef.current = onFocusModeChange;

  const openFocusMode = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setFocusMode(true);
    setFade(reducedMotion ? null : 'in');
    onFocusModeChangeRef.current?.(true);
    if (!reducedMotion) {
      fadeTimerRef.current = setTimeout(() => setFade(null), FOCUS_FADE_MS);
    }
  }, [reducedMotion]);

  const closeFocusMode = useCallback(() => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    const done = () => {
      setFocusMode(false);
      setFade(null);
      onFocusModeChangeRef.current?.(false);
      // Focus returns to the control (it is the same button in both states), unless it has
      // already gone somewhere else during the fade (e.g. the finder's search box, Ctrl/Cmd+K).
      const active = document.activeElement;
      if (!active || active === document.body || containerRef.current?.contains(active)) {
        focusToggleRef.current?.focus();
      }
    };
    if (reducedMotion) {
      done();
      return;
    }
    setFade('out');
    fadeTimerRef.current = setTimeout(done, FOCUS_FADE_MS);
  }, [reducedMotion]);

  // T-578 review: the section finder (z-40) opens under the layer (z-45), so anything that
  // opens it closes focus mode first: at once, with no fade, and without moving focus. The
  // finder then records the editor as where to return to, moves focus into itself after the
  // same commit that removed the layer, and is visible and operable.
  const focusModeRef = useRef(false);
  focusModeRef.current = focusMode;
  const closeFocusModeForFinder = useCallback(() => {
    if (!focusModeRef.current) return;
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    focusModeRef.current = false;
    setFocusMode(false);
    setFade(null);
    onFocusModeChangeRef.current?.(false);
  }, []);

  const toggleFocusMode = useCallback(() => {
    if (focusMode && fade !== 'out') closeFocusMode();
    else if (!focusMode) openFocusMode();
  }, [focusMode, fade, closeFocusMode, openFocusMode]);

  // Keys while focus mode is open. This handler is on the layer itself, so it only sees keys
  // while focus is inside the layer. The layer root is focusable (tabIndex -1) while open, so a
  // click on a blank part of the layer focuses the root instead of dropping focus to <body>.
  const handleLayerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!focusMode) return;

    // Ctrl/Cmd+K opens the section finder (its window listener). Close the layer first, also
    // during the fade-out, and let the event go on to that listener: no preventDefault, no
    // stopPropagation.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      closeFocusModeForFinder();
      return;
    }

    if (fade === 'out') return;

    // Escape closes focus mode. Tiptap has no Escape command, but ProseMirror's own keydown
    // handling marks Escape defaultPrevented, so that flag is not checked here. Nothing inside
    // the layer opens anything Escape should close first; dialogs (z-50) are not in the editor.
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFocusMode();
      return;
    }

    // Tab and Shift+Tab wrap inside the layer, so focus never lands on a control hidden under
    // it (WCAG 2.4.11). A Tab Tiptap has already used (indenting a list item) is left alone.
    if (e.key === 'Tab' && !e.defaultPrevented && containerRef.current) {
      const items = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(LAYER_FOCUSABLE),
      ).filter((el) => !el.closest('[inert], [hidden]'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // On the layer root itself (after a click on a blank part) the next stop is the first
      // control and the previous one the last: Shift+Tab from the root would otherwise leave.
      const atRoot = active === containerRef.current;
      const inside = active instanceof HTMLElement && containerRef.current.contains(active);
      if (e.shiftKey && (active === first || atRoot || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || atRoot || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // Page scroll is locked while the layer is open (overflow hidden on html), and restored to
  // what it was on exit or unmount.
  useEffect(() => {
    if (!focusMode || typeof document === 'undefined') return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = previous;
    };
  }, [focusMode]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

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
      // T-578 review: the finder opens under the focus-mode layer; close the layer first.
      closeFocusModeForFinder();
      window.dispatchEvent(
        new CustomEvent(SECTION_FINDER_OPEN_EVENT, {
          detail: { preload: { code, section } },
        }),
      );
    }
    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  }, [editor, closeFocusModeForFinder]);

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

  // T-578: the same three nodes in both modes; only their classes change.
  const layerClass = focusMode
    ? [
        // Fixed layer on Wall: above the sidebar (30), below every dialog (50), the consent
        // sheet (55) and the command bar (60). Safe-area insets padded (viewport-fit=cover).
        // outline-none: the root takes focus only from a click on a blank part (tabIndex -1).
        'fixed inset-0 z-[45] flex flex-col bg-nl-wall outline-none',
        'pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]',
        'pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]',
        'transition-opacity duration-150 ease-[ease] motion-reduce:transition-none',
        fade === 'out' ? 'opacity-0' : 'opacity-100',
        fade === 'in' ? 'motion-safe:animate-[nl-fade-in_150ms_ease_both]' : '',
      ].join(' ')
    : 'flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm';
  // 390: the sheet fills the width with a 16px gutter; from sm it is centred at 210mm, 24px top.
  const canvasClass = focusMode
    ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain bg-nl-wall p-4 sm:px-6 sm:pb-6 sm:pt-6'
    : 'overflow-y-auto bg-slate-100 p-2 lg:min-h-0 lg:flex-1 lg:p-6';
  const sheetClass = focusMode
    ? 'mx-auto bg-white sm:max-w-[210mm] sm:shadow-md'
    : 'mx-auto max-w-[210mm] bg-white shadow-md';

  return (
    // The keydown handler only acts while focus mode is open (Escape closes it).
    <div
      ref={containerRef}
      className={layerClass}
      onKeyDown={handleLayerKeyDown}
      tabIndex={focusMode ? -1 : undefined}
      data-focus-mode={focusMode ? 'open' : undefined}
    >
      <Toolbar
        editor={editor}
        focusMode={focusMode}
        onToggleFocusMode={toggleFocusMode}
        focusToggleRef={focusToggleRef}
        saveState={saveState}
      />
      {/* Paper canvas — A4-like proportions. From md it scrolls on its own; below md it is as
          tall as the draft and the page scrolls (T-138). In focus mode it scrolls in the layer. */}
      <div className={canvasClass}>
        <div className={sheetClass}>
          <EditorContent editor={editor} />
        </div>
      </div>
      {/* T-578 (Ajay, 23 Oct): in focus mode the T-197 disclaimer is pinned to the bottom of the
          layer, a flex child after the scroll area, so it never scrolls away and the draft never
          runs under it. Same text as the page's line (the page passes it). Not dismissible. */}
      {focusMode && focusFooter && (
        <p
          role="note"
          className="border-nl-line bg-nl-wall text-nl-muted shrink-0 border-t p-2 text-center text-[13px] leading-5"
        >
          {focusFooter}
        </p>
      )}
    </div>
  );
}
