'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

interface AccordionItem {
  question: string;
  answer: string;
}

interface AccordionProps {
  items: AccordionItem[];
  singleOpen?: boolean;
}

function AccItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`acc-item${isOpen ? 'is-open' : ''}`}>
      <button className="acc-trigger" type="button" onClick={onToggle}>
        {question}{' '}
        <span className="acc-icon">
          <Plus
            strokeWidth={1.5}
            style={{
              transform: isOpen ? 'rotate(45deg)' : undefined,
              transition: 'transform 0.2s',
            }}
          />
        </span>
      </button>
      <div
        className="acc-panel"
        ref={panelRef}
        style={{
          height: isOpen ? (panelRef.current?.scrollHeight ?? 1000) + 'px' : '0px',
        }}
      >
        <div className="acc-panel-inner">{answer}</div>
      </div>
    </div>
  );
}

export default function Accordion({ items, singleOpen = true }: AccordionProps) {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setOpenIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        if (singleOpen) next.clear();
        next.add(i);
      }
      return next;
    });
  }

  return (
    <div className="accordion">
      {items.map((item, i) => (
        <AccItem
          key={i}
          question={item.question}
          answer={item.answer}
          isOpen={openIndexes.has(i)}
          onToggle={() => toggle(i)}
        />
      ))}
    </div>
  );
}
