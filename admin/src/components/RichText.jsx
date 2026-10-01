import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { useEffect, useState } from 'react';
import { MediaPicker } from './Media.jsx';

/** Word-like editor that stores HTML. */
export default function RichText({ value, onChange }) {
  const [picker, setPicker] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  // keep in sync if value is replaced from outside (e.g. restoring a revision)
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(value === '' && editor.getHTML() === '<p></p>')) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  if (!editor) return null;
  const B = ({ cmd, on, children, title }) => (
    <button type="button" title={title} className={on ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); cmd(); }}>{children}</button>
  );
  const c = () => editor.chain().focus();
  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link URL (leave empty to remove)', prev);
    if (url === null) return;
    if (!url) c().unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="rte">
      <div className="rte-bar">
        <B title="Heading 2" on={editor.isActive('heading', { level: 2 })} cmd={() => c().toggleHeading({ level: 2 }).run()}>H2</B>
        <B title="Heading 3" on={editor.isActive('heading', { level: 3 })} cmd={() => c().toggleHeading({ level: 3 }).run()}>H3</B>
        <B title="Paragraph" on={editor.isActive('paragraph')} cmd={() => c().setParagraph().run()}>¶</B>
        <span className="sep" />
        <B title="Bold" on={editor.isActive('bold')} cmd={() => c().toggleBold().run()}><b>B</b></B>
        <B title="Italic" on={editor.isActive('italic')} cmd={() => c().toggleItalic().run()}><i>I</i></B>
        <B title="Underline" on={editor.isActive('underline')} cmd={() => c().toggleUnderline().run()}><u>U</u></B>
        <B title="Link" on={editor.isActive('link')} cmd={setLink}>🔗</B>
        <span className="sep" />
        <B title="Bullet list" on={editor.isActive('bulletList')} cmd={() => c().toggleBulletList().run()}>• List</B>
        <B title="Numbered list" on={editor.isActive('orderedList')} cmd={() => c().toggleOrderedList().run()}>1. List</B>
        <B title="Quote" on={editor.isActive('blockquote')} cmd={() => c().toggleBlockquote().run()}>❝</B>
        <span className="sep" />
        <B title="Align left" on={editor.isActive({ textAlign: 'left' })} cmd={() => c().setTextAlign('left').run()}>⯇</B>
        <B title="Align center" on={editor.isActive({ textAlign: 'center' })} cmd={() => c().setTextAlign('center').run()}>≡</B>
        <B title="Insert image" cmd={() => setPicker(true)}>🖼</B>
        <span className="sep" />
        <B title="Undo" cmd={() => c().undo().run()}>↶</B>
        <B title="Redo" cmd={() => c().redo().run()}>↷</B>
      </div>
      <EditorContent editor={editor} />
      {picker && (
        <MediaPicker accept="image/*" onClose={() => setPicker(false)}
          onSelect={([m]) => { c().setImage({ src: m.sizes?.large || m.url, alt: m.alt }).run(); setPicker(false); }} />
      )}
    </div>
  );
}
