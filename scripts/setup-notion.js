const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PARENT_PAGE_ID = "334a5446-93d9-80db-92f2-ed6fb862f6e1";

const headers = {
  "Authorization": `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

async function createPage(title, parentId, emoji) {
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { page_id: parentId },
      icon: { type: "emoji", emoji },
      properties: {
        title: { title: [{ text: { content: title } }] }
      }
    })
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Failed to create page: ${title} — ${JSON.stringify(data)}`);
  console.log(`✓ Page: ${title} (${data.id})`);
  return data.id;
}

async function createDatabase(title, parentId, emoji, properties) {
  const res = await fetch("https://api.notion.com/v1/databases", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { page_id: parentId },
      icon: { type: "emoji", emoji },
      title: [{ type: "text", text: { content: title } }],
      properties
    })
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Failed to create DB: ${title} — ${JSON.stringify(data)}`);
  console.log(`✓ Database: ${title} (${data.id})`);
  return data.id;
}

async function main() {
  // Create Startup HQ hub page
  const hubId = await createPage("🚀 Startup HQ", PARENT_PAGE_ID, "🚀");

  // 1. Tasks
  await createDatabase("Tasks", hubId, "✅", {
    "Name": { title: {} },
    "Status": { select: { options: [
      { name: "Not Started", color: "gray" },
      { name: "In Progress", color: "blue" },
      { name: "Done", color: "green" },
      { name: "Blocked", color: "red" }
    ]}},
    "Priority": { select: { options: [
      { name: "High", color: "red" },
      { name: "Medium", color: "yellow" },
      { name: "Low", color: "gray" }
    ]}},
    "Due Date": { date: {} },
    "Project": { select: { options: [
      { name: "Swayat", color: "purple" },
      { name: "Marketing", color: "pink" },
      { name: "Personal", color: "blue" },
      { name: "Startup School", color: "orange" }
    ]}},
    "Notes": { rich_text: {} }
  });

  // 2. Meetings
  await createDatabase("Meetings", hubId, "📅", {
    "Title": { title: {} },
    "Date": { date: {} },
    "Attendees": { rich_text: {} },
    "Type": { select: { options: [
      { name: "Internal", color: "blue" },
      { name: "Investor", color: "green" },
      { name: "Customer", color: "purple" },
      { name: "Partner", color: "orange" },
      { name: "Demo", color: "pink" }
    ]}},
    "Agenda": { rich_text: {} },
    "Notes": { rich_text: {} },
    "Action Items": { rich_text: {} },
    "Follow-up Done": { checkbox: {} }
  });

  // 3. CRM
  await createDatabase("CRM / Contacts", hubId, "👥", {
    "Name": { title: {} },
    "Company": { rich_text: {} },
    "Role": { rich_text: {} },
    "Stage": { select: { options: [
      { name: "Lead", color: "gray" },
      { name: "Connected", color: "blue" },
      { name: "In Conversation", color: "yellow" },
      { name: "Partner", color: "green" },
      { name: "Investor", color: "purple" },
      { name: "Customer", color: "pink" }
    ]}},
    "Email": { email: {} },
    "LinkedIn": { url: {} },
    "Last Contact": { date: {} },
    "Notes": { rich_text: {} }
  });

  // 4. Demos & Pitches
  await createDatabase("Demos & Pitches", hubId, "🎯", {
    "Title": { title: {} },
    "Date": { date: {} },
    "Prospect / Audience": { rich_text: {} },
    "Type": { select: { options: [
      { name: "Demo", color: "blue" },
      { name: "Pitch", color: "purple" },
      { name: "Investor Meeting", color: "green" },
      { name: "Conference", color: "orange" }
    ]}},
    "Status": { select: { options: [
      { name: "Scheduled", color: "yellow" },
      { name: "Done", color: "green" },
      { name: "Follow-up Pending", color: "orange" },
      { name: "Closed", color: "gray" }
    ]}},
    "Outcome": { rich_text: {} },
    "Next Steps": { rich_text: {} }
  });

  // 5. Marketing Strategy
  await createDatabase("Marketing Strategy", hubId, "📣", {
    "Campaign": { title: {} },
    "Channel": { select: { options: [
      { name: "LinkedIn", color: "blue" },
      { name: "Twitter/X", color: "gray" },
      { name: "Instagram", color: "pink" },
      { name: "Reddit", color: "orange" },
      { name: "Email", color: "green" },
      { name: "SEO/Blog", color: "purple" }
    ]}},
    "Status": { select: { options: [
      { name: "Idea", color: "gray" },
      { name: "Planning", color: "yellow" },
      { name: "Active", color: "green" },
      { name: "Completed", color: "blue" },
      { name: "Paused", color: "orange" }
    ]}},
    "Goal": { rich_text: {} },
    "Start Date": { date: {} },
    "Notes": { rich_text: {} }
  });

  // 6. Content Calendar
  await createDatabase("Content Calendar", hubId, "📆", {
    "Title": { title: {} },
    "Platform": { select: { options: [
      { name: "LinkedIn", color: "blue" },
      { name: "Twitter/X", color: "gray" },
      { name: "Instagram", color: "pink" },
      { name: "Blog", color: "green" },
      { name: "Newsletter", color: "purple" },
      { name: "Reddit", color: "orange" }
    ]}},
    "Status": { select: { options: [
      { name: "Idea", color: "gray" },
      { name: "Draft", color: "yellow" },
      { name: "Review", color: "orange" },
      { name: "Scheduled", color: "blue" },
      { name: "Published", color: "green" }
    ]}},
    "Publish Date": { date: {} },
    "Content Type": { select: { options: [
      { name: "Post", color: "blue" },
      { name: "Thread", color: "purple" },
      { name: "Article", color: "green" },
      { name: "Video", color: "red" },
      { name: "Story", color: "pink" }
    ]}},
    "Copy": { rich_text: {} },
    "Link": { url: {} }
  });

  // 7. OKRs / Goals
  await createDatabase("OKRs & Goals", hubId, "🎯", {
    "Objective": { title: {} },
    "Quarter": { select: { options: [
      { name: "Q1 2026", color: "blue" },
      { name: "Q2 2026", color: "green" },
      { name: "Q3 2026", color: "yellow" },
      { name: "Q4 2026", color: "orange" }
    ]}},
    "Status": { select: { options: [
      { name: "On Track", color: "green" },
      { name: "At Risk", color: "yellow" },
      { name: "Behind", color: "red" },
      { name: "Completed", color: "blue" }
    ]}},
    "Key Results": { rich_text: {} },
    "Progress (%)": { number: { format: "percent" } },
    "Owner": { rich_text: {} }
  });

  // 8. Product Roadmap
  await createDatabase("Product Roadmap", hubId, "🗺️", {
    "Feature": { title: {} },
    "Status": { select: { options: [
      { name: "Backlog", color: "gray" },
      { name: "Planned", color: "blue" },
      { name: "In Progress", color: "yellow" },
      { name: "Done", color: "green" },
      { name: "Cancelled", color: "red" }
    ]}},
    "Priority": { select: { options: [
      { name: "P0 - Critical", color: "red" },
      { name: "P1 - High", color: "orange" },
      { name: "P2 - Medium", color: "yellow" },
      { name: "P3 - Low", color: "gray" }
    ]}},
    "Product": { select: { options: [
      { name: "Swayat", color: "purple" },
      { name: "Marketing Site", color: "blue" },
      { name: "Mobile App", color: "green" }
    ]}},
    "Target Date": { date: {} },
    "Description": { rich_text: {} }
  });

  console.log("\n✅ Startup HQ setup complete!");
}

main().catch(console.error);
