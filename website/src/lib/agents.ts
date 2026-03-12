export interface AgentDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const AGENTS: AgentDef[] = [
  {
    id: "general",
    name: "General Assistant",
    description: "Your all-purpose AI assistant. Handles any task — writing, research, coding, emails, and more.",
    icon: "🤖",
  },
  {
    id: "website-manager",
    name: "Website Manager",
    description: "Builds pages, fixes bugs, deploys updates, and handles SEO for your website.",
    icon: "🌐",
  },
  {
    id: "marketing",
    name: "Marketing Assistant",
    description: "Creates campaigns, writes copy, plans content calendars, and manages social media strategy.",
    icon: "📢",
  },
  {
    id: "code-assistant",
    name: "Code Assistant",
    description: "Your dedicated coding partner — writes, debugs, and reviews code across any language.",
    icon: "💻",
  },
  {
    id: "researcher",
    name: "Research Analyst",
    description: "Deep-dives into topics, analyzes data, compares options, and delivers structured insights.",
    icon: "🔍",
  },
];
