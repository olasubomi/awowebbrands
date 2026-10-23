'use strict';

// Application-owned catalog: no prices are published until the owner reviews them.
const categories = [
  { id: 'web', name: 'Web services' },
  { id: 'marketing', name: 'Digital marketing' },
  { id: 'education', name: 'Tutoring and exam preparation' },
  { id: 'career', name: 'Interview preparation and bootcamps' }
];

const question = (id, label, type, options = [], required = false) => ({ id, label, type, options, required });
const services = [
  {
    id: 'website-management', category: 'web', name: 'Website management',
    summary: 'Keep your existing website useful, current, and working for your business.',
    includes: ['Website updates and maintenance', 'Content and functionality changes', 'Website refreshes and larger improvements'],
    questions: [
      question('websiteUrl', 'Existing website URL (if you have one)', 'url'),
      question('supportType', 'What kind of help do you need?', 'select', ['Updates or fixes', 'Ongoing maintenance', 'A website refresh', 'Not sure yet'], true)
    ]
  },
  {
    id: 'web-development', category: 'web', name: 'Web development',
    summary: 'Discuss a new website or web application built around your business needs.',
    includes: ['Business websites', 'Web applications and integrations', 'Requirements and scope discussion'],
    questions: [
      question('websiteType', 'What would you like to build?', 'select', ['Business website', 'Online store', 'Web application', 'Not sure yet'], true),
      question('websiteUrl', 'Existing website or reference URL (optional)', 'url')
    ]
  },
  {
    id: 'digital-marketing', category: 'marketing', name: 'Digital marketing',
    summary: 'Improve how people discover and engage with your business online.',
    includes: ['Online branding', 'Facebook and Google advertising campaigns', 'Search engine optimization'],
    questions: [
      question('marketingGoal', 'What is your main marketing goal?', 'select', ['Build awareness', 'Generate inquiries', 'Increase sales', 'Not sure yet'], true),
      question('websiteUrl', 'Business website URL (optional)', 'url'),
      question('channels', 'Existing social channels or campaigns (optional)', 'text')
    ]
  },
  {
    id: 'tutoring', category: 'education', name: 'Tutoring and exam preparation',
    summary: 'Get help with a subject, course, or upcoming exam through Soft Web Services.',
    includes: ['High-school and college tutoring', 'Algebra, precalculus, calculus, and other subjects', 'Course and exam preparation support'],
    questions: [
      question('subject', 'Which subject, course, or exam do you need help with?', 'text', [], true),
      question('level', 'What level are you studying?', 'select', ['High school', 'College', 'Professional or other'], true),
      question('targetDate', 'Exam or important course date (optional)', 'date')
    ]
  },
  {
    id: 'interview-preparation', category: 'career', name: 'Interview preparation and bootcamps',
    summary: 'Prepare for software-engineering interviews with feedback, resources, and mentoring.',
    includes: ['Mock interview sessions', 'Interview preparation resources', 'Consulting, feedback, and mentoring packages'],
    questions: [
      question('targetRole', 'What role or interview are you preparing for?', 'text', [], true),
      question('supportType', 'What support are you interested in?', 'select', ['Mock interviews and feedback', 'Preparation resources', 'Mentoring or a bootcamp', 'Not sure yet'], true),
      question('targetDate', 'Interview date (optional)', 'date')
    ]
  }
];

const generalService = {
  id: 'not-sure', name: 'Help choosing a service',
  summary: 'Describe what you would like to achieve and we will help identify the right service.',
  questions: []
};

function findService(id) {
  return id === generalService.id ? generalService : services.find(service => service.id === id);
}

module.exports = { categories, services, generalService, findService };
