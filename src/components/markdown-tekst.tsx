import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import clsx from "clsx";

/**
 * Rendert AI-antwoorden met echte opmaak (vet, opsommingen, links) i.p.v.
 * letterlijke **sterretjes** - dat maakt langere uitleg in de chats veel
 * makkelijker leesbaar voor een leerling. remark-breaks zorgt dat een enkele
 * regelovergang (zoals de AI die vaak schrijft) ook echt een nieuwe regel
 * wordt, niet alleen een dubbele witregel.
 */
export function MarkdownTekst({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={clsx(
        "text-sm leading-relaxed",
        "[&_p]:mb-2 [&_p:last-child]:mb-0",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_strong]:font-semibold",
        "[&_em]:italic",
        "[&_code]:rounded [&_code]:bg-black/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
        "[&_a]:underline [&_a]:underline-offset-2",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-current/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:opacity-90",
        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
        "[&_th]:border [&_th]:border-current/20 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        "[&_td]:border [&_td]:border-current/20 [&_td]:px-2 [&_td]:py-1",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{children}</ReactMarkdown>
    </div>
  );
}
