import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMarkdownProps {
  content: string;
}

const components: Components = {
  a({ children, href, ...props }) {
    return (
      <a href={href} rel="noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  }
};

export function ChatMarkdown({
  content
}: ChatMarkdownProps): React.JSX.Element {
  return (
    <div className="chat-markdown">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
