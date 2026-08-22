import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse border border-gray-300">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-200">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody>{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="border border-gray-300">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2 text-left font-semibold border border-gray-300">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2 border border-gray-300">
            {children}
          </td>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside my-2 space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside my-2 space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        p: ({ children }) => <p className="my-1">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-sm">
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
