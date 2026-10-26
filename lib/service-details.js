"use strict";

// Editorial content, separate from the inquiry schema and API catalog contract.
// Owner-confirmed display rates. Commission percentages and terms are not assumed.
const details = {
  "website-management": {
    audience: "For businesses with a website that needs attention.",
    intro:
      "Keep your website useful as your business changes. Start with an update, a fix, or a conversation about ongoing support.",
    options: [
      {
        name: "Website updates and management",
        description:
          "Discuss content changes, fixes, and maintenance for your existing website.",
        includes: [
          "Review the changes or issues you have identified",
          "Agree on the work and access required",
          "Confirm priorities and a suitable support arrangement",
        ],
      },
      {
        name: "Website refresh",
        description: "Plan a larger improvement to an existing website.",
        includes: [
          "Review the current site and business goals",
          "Identify improvements to content, layout, or functionality",
          "Agree on scope before work begins",
        ],
      },
    ],
    price: "$50/hour",
    priceScope: "Website updates and management.",
    prepare: [
      "Your website address",
      "The changes or problems you want help with",
      "Whether you need a one-time update or ongoing support",
    ],
    faqs: [
      [
        "Can you work on my existing website?",
        "Share its address and the changes you need. We will review the platform and access requirements before confirming the work.",
      ],
      [
        "Is ongoing support available?",
        "We can discuss maintenance and future updates. The tasks, frequency, and price are agreed for your website.",
      ],
    ],
  },
  "web-development": {
    audience: "For a new business website, online store, or web application.",
    intro:
      "Turn your business requirements into a plan for a website or application. We will help clarify what you need before agreeing on the build.",
    options: [
      {
        name: "Business website",
        description:
          "A website organized around your business, services, and audience.",
        includes: [
          "Discuss your audience, goals, and pages",
          "Identify required content and features",
          "Agree on the build scope and launch requirements",
        ],
      },
      {
        name: "Web application or integration",
        description:
          "Discuss functionality beyond a standard informational website.",
        includes: [
          "Map the user flows and required features",
          "Review integrations and data requirements",
          "Agree on priorities and delivery scope",
        ],
      },
    ],
    prepare: [
      "The type of website or application you want",
      "Examples or an existing website, if available",
      "The key features and business goals",
    ],
    faqs: [
      [
        "Do I need a complete technical specification?",
        "No. Describe your goal and the features you have in mind. We will use that discussion to clarify scope.",
      ],
      [
        "Can we discuss an online store?",
        "Yes. Select Online store in the consultation form so we can discuss products, checkout, and any required integrations.",
      ],
    ],
  },
  "digital-marketing": {
    audience: "For businesses looking to reach and engage customers online.",
    intro:
      "Connect your online presence to a clear business goal, whether you want more awareness, inquiries, or sales.",
    options: [
      {
        name: "Online branding and campaign support",
        description: "Discuss your audience, messaging, and advertising goals.",
        includes: [
          "Review your business goals and current channels",
          "Discuss Facebook or Google advertising where appropriate",
          "Agree on campaign scope and reporting expectations",
        ],
      },
      {
        name: "Search visibility and online presence",
        description: "Discuss how people find and engage with your business.",
        includes: [
          "Review your website and online presence",
          "Identify relevant SEO and branding improvements",
          "Agree on priorities and the work to be delivered",
        ],
      },
    ],
    price: "$500 minimum plus commission",
    priceScope:
      "A $500 minimum service fee plus commission. The commission rate, how commission is calculated, advertising spend, and campaign scope will be agreed before work begins.",
    prepare: [
      "Your main goal: awareness, inquiries, or sales",
      "Your website and current social channels",
      "Any existing campaigns or audience information",
    ],
    faqs: [
      [
        "Does the price include advertising spend?",
        "The service starts at $500 plus commission. Advertising spend and the commission rate and calculation basis are agreed separately as part of the campaign scope before work begins.",
      ],
      [
        "Where can I see previous work?",
        "The homepage includes original Dentox and ChopChow campaign screenshots and feedback from ROG Music Africa. Results depend on the campaign and business context.",
      ],
    ],
  },
  tutoring: {
    audience: "For high-school, college, and other learners.",
    intro:
      "Get support with a subject, course, or upcoming exam. We begin with what you are studying and where you need help.",
    options: [
      {
        name: "Subject and course support",
        description: "Work through topics and strengthen your understanding.",
        includes: [
          "Discuss your subject and study level",
          "Identify the topics you want to work on",
          "Agree on suitable sessions and learning goals",
        ],
      },
      {
        name: "Exam preparation",
        description:
          "Prepare around an upcoming exam or important course date.",
        includes: [
          "Discuss the exam and topics to cover",
          "Review your preparation goals and available time",
          "Agree on the support and session arrangement",
        ],
      },
    ],
    prepare: [
      "The subject, course, or exam",
      "Your current study level",
      "Your exam date, if you have one",
    ],
    faqs: [
      [
        "Which subjects can I ask about?",
        "The service includes high-school and college support, including algebra, precalculus, and calculus. Share your subject so availability and suitability can be confirmed.",
      ],
      [
        "What happened to Awo STEM Coaching?",
        "Its tutoring and learning services are now offered through Soft Web Services.",
      ],
    ],
  },
  "interview-preparation": {
    audience:
      "For software-engineering candidates preparing for their next opportunity.",
    intro:
      "Practice explaining your approach, working through technical problems, and responding to interview feedback.",
    options: [
      {
        name: "Interview preparation bundle",
        description:
          "Discuss preparation resources and mock interview sessions together.",
        includes: [
          "Preparation resources relevant to your goals",
          "Mock interview practice and feedback",
          "Two mock interview sessions",
        ],
      },
      {
        name: "Practice, mentoring, or a bootcamp",
        description:
          "Choose support around your target role and preparation needs.",
        includes: [
          "Discuss the role and interview format",
          "Identify practice and feedback priorities",
          "Agree on the support arrangement and schedule",
        ],
      },
    ],
    price: "$75/bundle",
    priceScope:
      "Preparation resources and two mock interview sessions. Scheduling and session arrangements are confirmed before booking.",
    prepare: [
      "Your target role or interview format",
      "The support you want: practice, resources, or mentoring",
      "Your interview date, if known",
    ],
    faqs: [
      [
        "What does the $75 bundle include?",
        "Yes. The $75 bundle includes preparation resources and two mock interview sessions. We will confirm scheduling and session arrangements before booking.",
      ],
      [
        "Can I start without an interview date?",
        "Yes. Describe the role you are preparing for and the areas you want to improve.",
      ],
    ],
  },
};

module.exports = { details };
