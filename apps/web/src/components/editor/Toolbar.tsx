'use client';

import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Minus,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { ReactNode, Ref } from 'react';

interface ToolbarProps {
  editor: Editor | null;
  /** T-578: focus (full-screen) mode is open. */
  focusMode?: boolean;
  /** T-578: the focus-mode control. Without it the control is not shown. */
  onToggleFocusMode?: () => void;
  /** T-578: the control, so focus can return to it when focus mode closes. */
  focusToggleRef?: Ref<HTMLButtonElement>;
  /** T-578: the page's save state, shown next to the control while focus mode is open. */
  saveState?: ReactNode;
}

function ToolbarButton({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        isActive
          ? 'bg-amber-100 text-amber-700'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-slate-200" />;
}

export default function Toolbar({
  editor,
  focusMode = false,
  onToggleFocusMode,
  focusToggleRef,
  saveState,
}: ToolbarProps) {
  if (!editor) return null;

  // T-578 (Rajesh's updated note): the accessible name is fixed and aria-pressed carries the
  // state; only the title (and the icon) change.
  const focusTitle = focusMode ? 'Exit focus mode' : 'Focus mode';

  return (
    // T-578: the formatting buttons wrap in their own group, so the right group (focus-mode
    // control, and the save state in focus mode) stays in the first row, at the right, at 390.
    <div className="flex shrink-0 items-start border-b border-slate-200 bg-slate-50 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 self-center">
        {/* Undo/Redo */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <Redo size={15} />
        </ToolbarButton>

        <Divider />

        {/* Headings */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          title="Heading 3"
        >
          <Heading3 size={15} />
        </ToolbarButton>

        <Divider />

        {/* Inline formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          title="Bold"
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          title="Italic"
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          title="Underline"
        >
          <Underline size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough size={15} />
        </ToolbarButton>

        <Divider />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          title="Align left"
        >
          <AlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          title="Align center"
        >
          <AlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          title="Align right"
        >
          <AlignRight size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          title="Justify"
        >
          <AlignJustify size={15} />
        </ToolbarButton>

        <Divider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          title="Numbered list"
        >
          <ListOrdered size={15} />
        </ToolbarButton>

        <Divider />

        {/* Horizontal rule */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus size={15} />
        </ToolbarButton>
      </div>

      {onToggleFocusMode && (
        <>
          <div className="mx-1 h-5 w-px shrink-0 self-center bg-slate-200" />
          {/* Below sm the save state sits under the control, so the formatting buttons keep
              room for two rows; from sm it sits beside it. */}
          <div className="flex shrink-0 flex-col-reverse items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            {focusMode && saveState}
            <button
              ref={focusToggleRef}
              type="button"
              onClick={onToggleFocusMode}
              aria-label="Focus mode"
              title={focusTitle}
              aria-pressed={focusMode}
              className="nl-focus inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              {focusMode ? (
                <Minimize2 size={16} aria-hidden="true" />
              ) : (
                <Maximize2 size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
