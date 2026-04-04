// Demo data for a Bay Area real estate agent — 15 years experience, ~10 clients/month
// Used for test/demo sign-in: demo@swayat.com / demo2024

export const DEMO_USER = {
  email: "demo@swayat.com",
  password: "demo2024",
  name: "Apurva Jain",
  phone: "+14155550100",
  brokerage: "Compass Real Estate",
  license: "DRE #01987654",
  region: "San Francisco Bay Area",
  yearsExperience: 15,
};

const today = new Date();
const fmt = (d: Date) => d.toISOString().split("T")[0];
const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };
const daysFromNow = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };

export const DEMO_DASHBOARD = {
  found: true,
  summary: {
    totalLeads: 42,
    hotLeads: 8,
    warmLeads: 16,
    coldLeads: 18,
    closedWon: 6,
    closedLost: 3,
    totalProperties: 14,
    availableProperties: 8,
    soldProperties: 4,
    totalShowings: 67,
    todaysShowings: 3,
    overdueFollowups: 2,
    todaysFollowups: 4,
    activeCampaigns: 3,
    activeTransactions: 4,
    activeNurture: 11,
    totalValuations: 23,
    totalReferrals: 9,
    conversionRate: "14.3%",
  },

  todaysShowings: [
    { id: "s1", lead: "James Liu", property: "742 Hayes St, SF", time: "10:30 AM" },
    { id: "s2", lead: "Priya Sharma", property: "1820 Pacific Ave, SF", time: "1:00 PM" },
    { id: "s3", lead: "Michael Torres", property: "445 Bellevue Ave, Oakland", time: "4:00 PM" },
  ],

  overdueFollowups: [
    { lead: "David Kim", date: daysAgo(2), type: "Phone call", notes: "Wanted to discuss counter-offer on Noe Valley property" },
    { lead: "Rachel Green", date: daysAgo(1), type: "Email", notes: "Send updated CMA for Cole Valley homes" },
  ],

  todaysFollowups: [
    { lead: "James Liu", type: "Pre-showing prep", notes: "Send neighborhood walkability data for Hayes Valley" },
    { lead: "Anika Patel", type: "Check-in", notes: "1 week post-close — ask for review & referral" },
    { lead: "Tom & Linda Weber", type: "Listing update", notes: "Price reduction discussion — 30 days on market" },
    { lead: "Sophia Martinez", type: "Document follow-up", notes: "Pre-approval letter still pending from lender" },
  ],

  upcomingDeadlines: [
    { transaction: "Kim → 558 Noe St", deadline: "Inspection contingency removal", date: daysFromNow(3) },
    { transaction: "Okonkwo → 2215 Filbert St", deadline: "Appraisal due", date: daysFromNow(5) },
    { transaction: "Chen → 890 Leavenworth St", deadline: "Loan contingency removal", date: daysFromNow(7) },
    { transaction: "Tanaka → 3100 Clay St", deadline: "Closing date", date: daysFromNow(12) },
  ],

  recentLeads: [
    { id: "l1", name: "James Liu", phone: "+14155551001", type: "Buyer", category: "hot", score: 92, status: "showing", source: "Referral", lastContact: daysAgo(0), createdAt: daysAgo(14) },
    { id: "l2", name: "Sophia Martinez", phone: "+14155551002", type: "Buyer", category: "hot", score: 88, status: "qualified", source: "Zillow", lastContact: daysAgo(1), createdAt: daysAgo(21) },
    { id: "l3", name: "Michael Torres", phone: "+15105551003", type: "Buyer", category: "warm", score: 74, status: "showing", source: "Open House", lastContact: daysAgo(0), createdAt: daysAgo(30) },
    { id: "l4", name: "Emily & Jake Foster", phone: "+14155551004", type: "Buyer", category: "warm", score: 68, status: "contacted", source: "Website", lastContact: daysAgo(3), createdAt: daysAgo(7) },
    { id: "l5", name: "Tom & Linda Weber", phone: "+16505551005", type: "Seller", category: "warm", score: 71, status: "qualified", source: "Referral", lastContact: daysAgo(1), createdAt: daysAgo(45) },
  ],

  leads: [
    // Hot leads (8)
    { id: "l1", name: "James Liu", phone: "+14155551001", email: "james.liu@email.com", type: "Buyer", category: "hot", score: 92, status: "showing", source: "Referral", lastContact: daysAgo(0), propertyType: "Condo", preferredLocations: ["Hayes Valley", "SOMA", "Mission Bay"], budgetMin: 900000, budgetMax: 1300000, timeline: "1-2 months", showingsCount: 4, followupsCount: 8 },
    { id: "l2", name: "Sophia Martinez", phone: "+14155551002", email: "sophia.m@email.com", type: "Buyer", category: "hot", score: 88, status: "qualified", source: "Zillow", lastContact: daysAgo(1), propertyType: "Single Family", preferredLocations: ["Noe Valley", "Glen Park", "Bernal Heights"], budgetMin: 1500000, budgetMax: 2200000, timeline: "2-3 months", showingsCount: 2, followupsCount: 5 },
    { id: "l6", name: "David Kim", phone: "+14155551006", email: "dkim@email.com", type: "Buyer", category: "hot", score: 95, status: "negotiation", source: "Referral", lastContact: daysAgo(2), propertyType: "Single Family", preferredLocations: ["Noe Valley", "Cole Valley"], budgetMin: 1800000, budgetMax: 2500000, timeline: "ASAP", showingsCount: 6, followupsCount: 12 },
    { id: "l7", name: "Amara Okonkwo", phone: "+14155551007", email: "amara.o@email.com", type: "Buyer", category: "hot", score: 90, status: "negotiation", source: "Redfin", lastContact: daysAgo(1), propertyType: "Condo", preferredLocations: ["Pacific Heights", "Marina", "Cow Hollow"], budgetMin: 1200000, budgetMax: 1800000, timeline: "1 month", showingsCount: 5, followupsCount: 9 },
    { id: "l8", name: "Kevin Tanaka", phone: "+14155551008", email: "ktanaka@email.com", type: "Buyer", category: "hot", score: 86, status: "negotiation", source: "Open House", lastContact: daysAgo(0), propertyType: "Single Family", preferredLocations: ["Presidio Heights", "Laurel Heights"], budgetMin: 2500000, budgetMax: 3500000, timeline: "1-2 months", showingsCount: 7, followupsCount: 14 },
    { id: "l9", name: "Lisa Chen", phone: "+16505551009", email: "lisa.chen@email.com", type: "Buyer", category: "hot", score: 84, status: "showing", source: "Referral", lastContact: daysAgo(1), propertyType: "Townhouse", preferredLocations: ["Palo Alto", "Menlo Park", "Mountain View"], budgetMin: 2000000, budgetMax: 3000000, timeline: "2-3 months", showingsCount: 3, followupsCount: 6 },
    { id: "l10", name: "Raj & Meera Patel", phone: "+14085551010", email: "rajpatel@email.com", type: "Seller", category: "hot", score: 82, status: "qualified", source: "Sphere of Influence", lastContact: daysAgo(3), propertyType: "Single Family", preferredLocations: ["Cupertino"], budgetMin: 0, budgetMax: 0, timeline: "1 month", showingsCount: 0, followupsCount: 4 },
    { id: "l11", name: "Rachel Green", phone: "+14155551011", email: "rgreen@email.com", type: "Buyer", category: "hot", score: 80, status: "showing", source: "Website", lastContact: daysAgo(1), propertyType: "Condo", preferredLocations: ["Cole Valley", "Inner Sunset", "Inner Richmond"], budgetMin: 800000, budgetMax: 1100000, timeline: "2-3 months", showingsCount: 3, followupsCount: 7 },

    // Warm leads (8 of 16)
    { id: "l3", name: "Michael Torres", phone: "+15105551003", email: "mtorres@email.com", type: "Buyer", category: "warm", score: 74, status: "showing", source: "Open House", lastContact: daysAgo(0), propertyType: "Single Family", preferredLocations: ["Oakland Hills", "Rockridge", "Temescal"], budgetMin: 1000000, budgetMax: 1600000, timeline: "3-6 months", showingsCount: 2, followupsCount: 4 },
    { id: "l4", name: "Emily & Jake Foster", phone: "+14155551004", email: "efoster@email.com", type: "Buyer", category: "warm", score: 68, status: "contacted", source: "Website", lastContact: daysAgo(3), propertyType: "Condo", preferredLocations: ["SOMA", "Mission Bay", "Dogpatch"], budgetMin: 700000, budgetMax: 1000000, timeline: "3-6 months", showingsCount: 0, followupsCount: 2 },
    { id: "l5", name: "Tom & Linda Weber", phone: "+16505551005", email: "weber.fam@email.com", type: "Seller", category: "warm", score: 71, status: "qualified", source: "Referral", lastContact: daysAgo(1), propertyType: "Single Family", preferredLocations: ["San Mateo"], budgetMin: 0, budgetMax: 0, timeline: "2-3 months", showingsCount: 0, followupsCount: 6 },
    { id: "l12", name: "Priya Sharma", phone: "+14155551012", email: "priya.s@email.com", type: "Buyer", category: "warm", score: 72, status: "showing", source: "Instagram Ad", lastContact: daysAgo(0), propertyType: "Condo", preferredLocations: ["Pacific Heights", "Russian Hill"], budgetMin: 1100000, budgetMax: 1600000, timeline: "3-6 months", showingsCount: 1, followupsCount: 3 },
    { id: "l13", name: "Nathan Brooks", phone: "+15105551013", email: "nbrooks@email.com", type: "Buyer", category: "warm", score: 65, status: "contacted", source: "Zillow", lastContact: daysAgo(5), propertyType: "Townhouse", preferredLocations: ["Berkeley", "Albany"], budgetMin: 1200000, budgetMax: 1800000, timeline: "6+ months", showingsCount: 0, followupsCount: 2 },
    { id: "l14", name: "Anika Patel", phone: "+14155551014", email: "anika.p@email.com", type: "Buyer", category: "warm", score: 60, status: "closed-won", source: "Referral", lastContact: daysAgo(7), propertyType: "Condo", preferredLocations: ["Marina", "Cow Hollow"], budgetMin: 900000, budgetMax: 1200000, timeline: "Closed", showingsCount: 4, followupsCount: 10 },
    { id: "l15", name: "Derek & Sue Chang", phone: "+16505551015", email: "dchang@email.com", type: "Seller", category: "warm", score: 62, status: "qualified", source: "Door Knock", lastContact: daysAgo(4), propertyType: "Single Family", preferredLocations: ["Redwood City"], budgetMin: 0, budgetMax: 0, timeline: "3-6 months", showingsCount: 0, followupsCount: 3 },
    { id: "l16", name: "Maria Santos", phone: "+14155551016", email: "msantos@email.com", type: "Buyer", category: "warm", score: 70, status: "showing", source: "Open House", lastContact: daysAgo(2), propertyType: "Single Family", preferredLocations: ["Sunset District", "Outer Richmond"], budgetMin: 1300000, budgetMax: 1800000, timeline: "2-3 months", showingsCount: 2, followupsCount: 5 },

    // Cold leads (8 of 18 — showing a representative sample)
    { id: "l17", name: "Chris Bennett", phone: "+14155551017", email: "cbennett@email.com", type: "Buyer", category: "cold", score: 35, status: "contacted", source: "Facebook Ad", lastContact: daysAgo(14), propertyType: "Condo", preferredLocations: ["SF"], budgetMin: 500000, budgetMax: 800000, timeline: "6+ months", showingsCount: 0, followupsCount: 1 },
    { id: "l18", name: "Yuki Watanabe", phone: "+14085551018", email: "ywatanabe@email.com", type: "Buyer", category: "cold", score: 30, status: "new", source: "Zillow", lastContact: daysAgo(10), propertyType: "Single Family", preferredLocations: ["Sunnyvale", "Santa Clara"], budgetMin: 1500000, budgetMax: 2000000, timeline: "6+ months", showingsCount: 0, followupsCount: 0 },
    { id: "l19", name: "Alex & Jordan Rivera", phone: "+15105551019", email: "arivera@email.com", type: "Buyer", category: "cold", score: 28, status: "contacted", source: "Website", lastContact: daysAgo(21), propertyType: "Townhouse", preferredLocations: ["Oakland", "Emeryville"], budgetMin: 800000, budgetMax: 1200000, timeline: "6+ months", showingsCount: 0, followupsCount: 1 },
    { id: "l20", name: "Patricia Moore", phone: "+16505551020", email: "pmoore@email.com", type: "Seller", category: "cold", score: 25, status: "new", source: "Direct Mail", lastContact: daysAgo(30), propertyType: "Single Family", preferredLocations: ["Daly City"], budgetMin: 0, budgetMax: 0, timeline: "Not sure", showingsCount: 0, followupsCount: 0 },
    { id: "l21", name: "Brian Walsh", phone: "+14155551021", email: "bwalsh@email.com", type: "Buyer", category: "cold", score: 32, status: "new", source: "Open House", lastContact: daysAgo(18), propertyType: "Condo", preferredLocations: ["Financial District", "Embarcadero"], budgetMin: 600000, budgetMax: 900000, timeline: "Not sure", showingsCount: 0, followupsCount: 0 },
    { id: "l22", name: "Olivia & Sam Thompson", phone: "+15105551022", email: "othompson@email.com", type: "Buyer", category: "cold", score: 22, status: "contacted", source: "Sphere of Influence", lastContact: daysAgo(25), propertyType: "Single Family", preferredLocations: ["Walnut Creek", "Lafayette"], budgetMin: 1200000, budgetMax: 1800000, timeline: "1 year+", showingsCount: 0, followupsCount: 1 },
  ],

  properties: [
    // Available listings
    { id: "p1", title: "742 Hayes St #4", type: "Condo", location: "Hayes Valley, SF", price: 1150000, bedrooms: 2, areaSqft: 1050, listingType: "Sale", status: "available", showingsCount: 8 },
    { id: "p2", title: "1820 Pacific Ave", type: "Condo", location: "Pacific Heights, SF", price: 1450000, bedrooms: 2, areaSqft: 1280, listingType: "Sale", status: "available", showingsCount: 12 },
    { id: "p3", title: "558 Noe St", type: "Single Family", location: "Noe Valley, SF", price: 2350000, bedrooms: 3, areaSqft: 1920, listingType: "Sale", status: "under-offer", showingsCount: 15 },
    { id: "p4", title: "2215 Filbert St", type: "Condo", location: "Marina, SF", price: 1575000, bedrooms: 2, areaSqft: 1150, listingType: "Sale", status: "under-offer", showingsCount: 9 },
    { id: "p5", title: "445 Bellevue Ave", type: "Single Family", location: "Oakland Hills", price: 1280000, bedrooms: 3, areaSqft: 1750, listingType: "Sale", status: "available", showingsCount: 5 },
    { id: "p6", title: "890 Leavenworth St #12", type: "Condo", location: "Nob Hill, SF", price: 875000, bedrooms: 1, areaSqft: 780, listingType: "Sale", status: "under-offer", showingsCount: 6 },
    { id: "p7", title: "3100 Clay St", type: "Single Family", location: "Presidio Heights, SF", price: 3200000, bedrooms: 4, areaSqft: 2650, listingType: "Sale", status: "under-offer", showingsCount: 11 },
    { id: "p8", title: "155 Sanchez St", type: "Townhouse", location: "Duboce Triangle, SF", price: 1680000, bedrooms: 3, areaSqft: 1540, listingType: "Sale", status: "available", showingsCount: 3 },
    { id: "p9", title: "2890 Broadway", type: "Condo", location: "Pacific Heights, SF", price: 2100000, bedrooms: 3, areaSqft: 1890, listingType: "Sale", status: "available", showingsCount: 1 },
    { id: "p10", title: "47 Guerrero St", type: "Single Family", location: "Mission Dolores, SF", price: 1950000, bedrooms: 3, areaSqft: 1680, listingType: "Sale", status: "available", showingsCount: 0 },

    // Sold properties
    { id: "p11", title: "1245 Masonic Ave", type: "Single Family", location: "Cole Valley, SF", price: 2100000, bedrooms: 3, areaSqft: 1850, listingType: "Sale", status: "sold", showingsCount: 14 },
    { id: "p12", title: "520 Marina Blvd #3", type: "Condo", location: "Marina, SF", price: 1125000, bedrooms: 2, areaSqft: 1020, listingType: "Sale", status: "sold", showingsCount: 10 },
    { id: "p13", title: "3360 Sacramento St", type: "Condo", location: "Presidio Heights, SF", price: 980000, bedrooms: 1, areaSqft: 850, listingType: "Sale", status: "sold", showingsCount: 7 },
    { id: "p14", title: "88 King St #1205", type: "Condo", location: "SOMA, SF", price: 1350000, bedrooms: 2, areaSqft: 1100, listingType: "Sale", status: "sold", showingsCount: 9 },
  ],

  campaigns: [
    { id: "c1", name: "Spring Bay Area Buyer Campaign", type: "Lead Generation", channels: ["Instagram", "Facebook", "Zillow"], status: "active", leadsGenerated: 14, createdAt: daysAgo(45) },
    { id: "c2", name: "Noe Valley Seller Outreach", type: "Direct Mail", channels: ["Direct Mail", "Email"], status: "active", leadsGenerated: 6, createdAt: daysAgo(30) },
    { id: "c3", name: "Open House — 742 Hayes St", type: "Open House", channels: ["MLS", "Instagram", "Flyer"], status: "active", leadsGenerated: 3, createdAt: daysAgo(7) },
    { id: "c4", name: "Q1 Past Client Newsletter", type: "Nurture", channels: ["Email"], status: "closed", leadsGenerated: 2, createdAt: daysAgo(60) },
    { id: "c5", name: "Pacific Heights Luxury Push", type: "Lead Generation", channels: ["Google Ads", "Zillow Premier"], status: "closed", leadsGenerated: 8, createdAt: daysAgo(90) },
  ],

  transactions: [
    { id: "t1", lead: "David Kim", property: "558 Noe St", salePrice: 2350000, status: "pending", closeDate: daysFromNow(18), contractDate: daysAgo(12), pendingDocs: 2 },
    { id: "t2", lead: "Amara Okonkwo", property: "2215 Filbert St", salePrice: 1575000, status: "pending", closeDate: daysFromNow(22), contractDate: daysAgo(8), pendingDocs: 3 },
    { id: "t3", lead: "Lisa Chen", property: "890 Leavenworth St #12", salePrice: 875000, status: "pending", closeDate: daysFromNow(25), contractDate: daysAgo(5), pendingDocs: 4 },
    { id: "t4", lead: "Kevin Tanaka", property: "3100 Clay St", salePrice: 3200000, status: "pending", closeDate: daysFromNow(12), contractDate: daysAgo(18), pendingDocs: 1 },
    { id: "t5", lead: "Anika Patel", property: "1245 Masonic Ave", salePrice: 2100000, status: "closed", closeDate: daysAgo(7), contractDate: daysAgo(37), pendingDocs: 0 },
    { id: "t6", lead: "Robert Hughes", property: "520 Marina Blvd #3", salePrice: 1125000, status: "closed", closeDate: daysAgo(30), contractDate: daysAgo(60), pendingDocs: 0 },
  ],
};
