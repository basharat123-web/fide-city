'use strict';
// All the wording on the public site lives here. Edit freely, then restart the server.

module.exports = {
  hero: {
    headline: 'Your story. Your city.',
    sub: 'Fide City is a serious-but-welcoming GTA V roleplay community. Build a character, pick a path from the badge to the underworld, and see where the night takes you.',
  },

  highlights: [
    {
      title: 'Roleplay that rewards effort',
      text: 'Characters, careers and consequences carry across sessions. What you do on Monday can come back on Friday.',
    },
    {
      title: 'Help when you start',
      text: 'New to roleplay? Ask on Discord and a helper will walk you through your first night.',
    },
    {
      title: 'Staff who keep it fair',
      text: 'Clear rules, logged actions and a report process that works. Everyone plays by the same standard.',
    },
  ],

  steps: [
    {
      title: 'Get GTA V',
      text: 'You need a legitimate copy of Grand Theft Auto V on PC from Steam, Epic Games or the Rockstar Games Launcher.',
    },
    {
      title: 'Install FiveM',
      text: 'FiveM is the free multiplayer client that lets you join roleplay servers like ours.',
      link: { label: 'Download FiveM', href: 'https://fivem.net/' },
    },
    {
      title: 'Join the Discord',
      text: 'Our Discord is where announcements, support and the community live. Verify there to get your roles.',
      discord: true,
    },
    {
      title: 'Connect to the city',
      text: 'Open FiveM, press F8 to open the console and paste the connect command below. Then create your character.',
      connect: true,
    },
  ],

  // group: used to organise the list on the home page.
  organizations: [
    {
      group: 'Emergency services',
      blurb: 'Keep the city safe, respond to calls and save lives.',
      items: [
        { name: 'Los Santos Police Department', short: 'LSPD', text: 'Patrol, investigations and community policing across the city.' },
        { name: 'San Andreas Highway Patrol', short: 'SAHP', text: 'Traffic enforcement and pursuits on the highways.' },
        { name: 'Emergency Medical Services', short: 'EMS', text: 'Paramedics and doctors responding to every kind of emergency.' },
        { name: 'Fire and Rescue', short: 'LSFD', text: 'Firefighters and rescue crews for fires, crashes and disasters.' },
      ],
    },
    {
      group: 'Government and law',
      blurb: 'Run the city, argue the case, keep the system honest.',
      items: [
        { name: 'City Government', short: 'GOV', text: 'Elected officials, aides and civil servants shaping city policy.' },
        { name: 'Department of Justice', short: 'DOJ', text: 'Judges, prosecutors and defense attorneys in the courtroom.' },
      ],
    },
    {
      group: 'Business and media',
      blurb: 'Start from nothing and build something with your name on it.',
      items: [
        { name: 'Mechanics and customs', short: 'MECH', text: 'Repair, tune and customize every vehicle in the city.' },
        { name: 'Taxi and transport', short: 'CAB', text: 'Get people where they are going, one fare at a time.' },
        { name: 'News and media', short: 'NEWS', text: 'Report the stories everyone is talking about.' },
        { name: 'Player-owned businesses', short: 'BIZ', text: 'Bars, shops, clubs and anything else you can pitch.' },
      ],
    },
    {
      group: 'Crime and gangs',
      blurb: 'High risk and high stakes. Crime is a story, not a free-for-all.',
      items: [
        { name: 'Street crews and gangs', short: 'GANG', text: 'Territory, reputation and rivalries built through roleplay.' },
        { name: 'Organized crime', short: 'ORG', text: 'Planned operations with real consequences if they fail.' },
      ],
    },
  ],

  faq: [
    {
      q: 'Is Fide City free to play?',
      a: 'Yes. You need your own copy of GTA V and the free FiveM client. Joining the community and playing costs nothing.',
    },
    {
      q: 'Do I need roleplay experience?',
      a: 'No. Everyone starts somewhere. Read the rules, ask questions on Discord and take your time.',
    },
    {
      q: 'What PC do I need?',
      a: 'If your computer runs GTA V smoothly, it will run Fide City. We recommend at least 16 GB of RAM and an SSD for faster loading.',
    },
    {
      q: 'How do I report a rule-breaker?',
      a: 'Open a ticket on Discord with the date, time, player names and a clip or screenshot. Keep it factual.',
    },
    {
      q: 'Can I bring my own character backstory?',
      a: 'Yes, and we encourage it. Keep it realistic for Los Santos and share it in the English Server forum if you like.',
    },
    {
      q: 'How do I join the police, EMS or other departments?',
      a: 'Each department recruits through Discord and the forum. Watch the announcements for open applications and requirements.',
    },
  ],

  rules: [
    {
      title: 'Community conduct',
      items: [
        'Treat every player and staff member with respect. Harassment, hate speech, discrimination and threats are never allowed, in game, on Discord or on this forum.',
        'No sharing of private information about anyone, including real names, addresses or photos, without their consent.',
        'Do not impersonate staff or other players.',
        'Listen to staff. If you disagree with a decision, appeal it through the proper channel instead of arguing in public.',
        'Cheating, mod menus, exploits and dupe glitches are an instant permanent ban. Report bugs instead of using them.',
        'Advertising other servers or communities is not allowed.',
      ],
    },
    {
      title: 'Roleplay standards',
      items: [
        'Stay in character. Your character has a past, motives and limits. Play them believably.',
        'Value your life (Fear RP). If someone has a weapon on you, or you are badly hurt, react like a real person would.',
        'FailRP is not allowed. Do not do things that would be impossible or absurd in real life, such as surviving obvious fatal falls or driving like a stunt double.',
        'Powergaming is not allowed. Do not force actions on other players or deny them a chance to respond.',
        'Metagaming is not allowed. Never use information your character does not know, including anything from Discord, streams or out-of-game chats.',
        'Random Deathmatch (RDM) and Vehicle Deathmatch (VDM) are not allowed. Violence needs a roleplay reason and a story.',
        'New Life Rule (NLR). After your character is downed and revived at the hospital, you forget the events that led to it and may not return to that scene or take revenge for it.',
        'Combat logging is not allowed. Do not disconnect during active roleplay or to avoid arrest or consequences.',
        'Break character (OOC) only when necessary, and keep it short.',
      ],
    },
    {
      title: 'Crime and conflict',
      items: [
        'Every criminal act needs a roleplay buildup. Do not jump straight to violence.',
        'Hostage and robbery rules, cooldowns and limits are set by staff and posted in announcements. Follow the current version.',
        'Do not target new players or interrupt their roleplay for no reason.',
        'Police and criminals both get a fair chance. Do not use staff connections, friendships or out-of-game knowledge to gain an advantage.',
      ],
    },
    {
      title: 'Reporting and enforcement',
      items: [
        'Report issues via a Discord ticket or technical support forum. Include date, time, names and a clip when you can.',
        'Staff may warn, mute, kick, suspend or ban depending on how serious the breach is and your history.',
        'Staff decisions can be appealed once. False reports and harassing staff will count against you.',
        'These rules can change. It is your responsibility to read the announcements.',
      ],
    },
  ],

  credits: {
    // Add your team here: { name, role, text }
    team: [
      { name: 'Fide City Leadership', role: 'Owners and management', text: 'Run the server, set the direction and keep the community healthy.' },
      { name: 'Development team', role: 'Scripts and systems', text: 'Build the jobs, features and in-game systems.' },
      { name: 'Staff team', role: 'Moderation and support', text: 'Answer tickets, enforce the rules and help new players.' },
    ],
  },
};
