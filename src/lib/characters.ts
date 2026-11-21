export interface TeacherCharacter {
  id: string;
  name: string;
  gender: 'male' | 'female';
  appearance: string;
  imageUrl: string;
  preferredLangs?: string[];
}

function buildTeacherAvatarSvg(initials: string, accentFrom: string, accentTo: string, isMale: boolean): string {
  const tieOrCollar = isMale
    ? `<path d="M58 92 L64 114 L70 92 Z" fill="${accentTo}" />`
    : `<path d="M46 92 Q64 104 82 92" fill="none" stroke="#f8fafc" stroke-width="2.5" opacity="0.85" />`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accentFrom}"/>
      <stop offset="100%" stop-color="${accentTo}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="#0f172a"/>
  <circle cx="64" cy="64" r="56" fill="url(#bg)" opacity="0.18"/>
  <path d="M26 122 C28 94 42 86 64 86 C86 86 100 94 102 122 Z" fill="url(#bg)" opacity="0.9"/>
  ${tieOrCollar}
  <circle cx="64" cy="54" r="24" fill="#1e293b" stroke="url(#bg)" stroke-width="3"/>
  <text x="64" y="61" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="20" fill="#f8fafc" text-anchor="middle" letter-spacing="1">${initials}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const TEACHER_CHARACTERS: TeacherCharacter[] = [
  {
    id: 'african-female-1',
    name: 'Prof. Amara',
    gender: 'female',
    appearance: 'Lead Academic Instructor in warm cream blazer, focused on clarity and step-by-step mastery.',
    imageUrl: buildTeacherAvatarSvg('PA', '#2563eb', '#0ea5e9', false),
    preferredLangs: ['en-GB', 'en-US', 'sw', 'ng', 'ke', 'en-KE'],
  },
  {
    id: 'african-male-1',
    name: 'Prof. Okoro',
    gender: 'male',
    appearance: 'Senior Engineering & Quantitative Methods Lecturer in charcoal suit.',
    imageUrl: buildTeacherAvatarSvg('PO', '#0ea5e9', '#10b981', true),
    preferredLangs: ['en-NG', 'en-GB', 'sw', 'ke', 'en-KE'],
  },
  {
    id: 'asian-female-1',
    name: 'Prof. Li',
    gender: 'female',
    appearance: 'Applied Sciences & Systems Professor with structured analytical focus.',
    imageUrl: buildTeacherAvatarSvg('PL', '#3b82f6', '#6366f1', false),
    preferredLangs: ['zh', 'ja', 'ko', 'en-US'],
  },
  {
    id: 'mediterranean-male-1',
    name: 'Dr. Marco',
    gender: 'male',
    appearance: 'Economics, History & Classical Logic Educator in tweed blazer.',
    imageUrl: buildTeacherAvatarSvg('DM', '#f59e0b', '#d97706', true),
    preferredLangs: ['it', 'es', 'fr', 'pt'],
  },
  {
    id: 'nordic-male-1',
    name: 'Dr. Soren',
    gender: 'male',
    appearance: 'Computer Science, AI & Software Architecture Mentor.',
    imageUrl: buildTeacherAvatarSvg('DS', '#06b6d4', '#2563eb', true),
    preferredLangs: ['de', 'sv', 'no', 'da', 'fi'],
  },
  {
    id: 'south-asian-female-1',
    name: 'Prof. Anaya',
    gender: 'female',
    appearance: 'Mathematics & Theoretical Foundations Instructor.',
    imageUrl: buildTeacherAvatarSvg('AN', '#ec4899', '#8b5cf6', false),
    preferredLangs: ['hi', 'bn', 'en-IN', 'ta', 'te'],
  },
  {
    id: 'hispanic-male-1',
    name: 'Dr. Carlos',
    gender: 'male',
    appearance: 'Biology, Medicine & Environmental Studies Lecturer.',
    imageUrl: buildTeacherAvatarSvg('DC', '#10b981', '#059669', true),
    preferredLangs: ['es', 'pt', 'en-US'],
  },
  {
    id: 'western-female-1',
    name: 'Dr. Sarah',
    gender: 'female',
    appearance: 'Literature, Academic Writing & Critical Reasoning Coach.',
    imageUrl: buildTeacherAvatarSvg('SR', '#6366f1', '#2563eb', false),
    preferredLangs: ['en-US', 'en-CA', 'en-AU'],
  },
  {
    id: 'asian-male-1',
    name: 'Prof. Tanaka',
    gender: 'male',
    appearance: 'Mechanical Engineering & Physics Problem-Solving Specialist.',
    imageUrl: buildTeacherAvatarSvg('PT', '#0284c7', '#1d4ed8', true),
    preferredLangs: ['ja', 'zh', 'en-US'],
  },
  {
    id: 'middle-eastern-female-1',
    name: 'Dr. Zoya',
    gender: 'female',
    appearance: 'Chemistry, Thermodynamics & Lab Analysis Educator.',
    imageUrl: buildTeacherAvatarSvg('DZ', '#14b8a6', '#0ea5e9', false),
    preferredLangs: ['ar', 'fa', 'tr', 'en-GB'],
  },
];

export function getCharacterForVoice(voice: SpeechSynthesisVoice | null): TeacherCharacter {
  if (!voice) return TEACHER_CHARACTERS[0];

  const voiceName = voice.name;
  const voiceLang = voice.lang;
  const lowerName = voiceName.toLowerCase();

  const maleKeywords = [
    'male', 'david', 'mark', 'soren', 'carlos', 'guy', 'andrew', 'brian',
    'james', 'peter', 'thomas', 'daniel', 'robert', 'paul', 'michael',
    'joseph', 'charles', 'christopher', 'william', 'hans', 'okoro', 'tanaka',
    'henry', 'george', 'samuel', 'arthur', 'frank', 'richard',
    'juma', 'ali', 'bakari', 'hamisi', 'musa', 'omari',
  ];

  const femaleKeywords = [
    'female', 'li', 'amara', 'anaya', 'zoya', 'sarah', 'yuki', 'monica',
    'linda', 'mary', 'susan', 'jessica', 'elizabeth', 'karen', 'nancy',
    'lisa', 'betty', 'helen', 'sandra', 'anna', 'emma', 'olivia',
    'asha', 'fatuma', 'rehema', 'zuwena', 'neema', 'zawadi', 'imani',
  ];

  const isMale = maleKeywords.some((kw) => lowerName.includes(kw));
  const isFemale = femaleKeywords.some((kw) => lowerName.includes(kw));
  const gender = isMale && !isFemale ? 'male' : 'female';

  const eligibleCharacters = TEACHER_CHARACTERS.filter((c) => c.gender === gender);
  const regionalMatch = eligibleCharacters.find((c) =>
    c.preferredLangs?.some((lang) => voiceLang.toLowerCase().includes(lang.toLowerCase()))
  );

  if (regionalMatch) return regionalMatch;

  const hash = voiceName.split('').reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 1), 0);
  return eligibleCharacters[hash % eligibleCharacters.length];
}

export function getVoiceForCharacter(
  character: TeacherCharacter,
  voices: SpeechSynthesisVoice[],
  currentLang: string
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const targetLangPrefix = currentLang.toLowerCase() === 'sw' ? 'sw' : 'en';

  let langMatches = voices.filter((v) => {
    const l = v.lang.toLowerCase();
    if (targetLangPrefix === 'sw') {
      return l.startsWith('sw') || v.name.toLowerCase().includes('swahili') || l.startsWith('en-ke');
    }
    return l.startsWith(targetLangPrefix);
  });

  if (langMatches.length === 0) {
    langMatches = voices;
  }

  const maleKeywords = [
    'male', 'david', 'mark', 'soren', 'carlos', 'guy', 'andrew', 'brian',
    'james', 'peter', 'thomas', 'daniel', 'robert', 'paul', 'michael',
    'joseph', 'charles', 'christopher', 'william', 'hans', 'okoro', 'tanaka',
    'henry', 'george', 'samuel', 'arthur', 'frank', 'richard',
    'juma', 'ali', 'bakari', 'hamisi', 'musa', 'omari',
  ];

  const femaleKeywords = [
    'female', 'li', 'amara', 'anaya', 'zoya', 'sarah', 'yuki', 'monica',
    'linda', 'mary', 'susan', 'jessica', 'elizabeth', 'karen', 'nancy',
    'lisa', 'betty', 'helen', 'sandra', 'anna', 'emma', 'olivia',
    'asha', 'fatuma', 'rehema', 'zuwena', 'neema', 'zawadi', 'imani',
  ];

  const getVoiceGender = (v: SpeechSynthesisVoice): 'male' | 'female' => {
    const lowerName = v.name.toLowerCase();
    const isMale = maleKeywords.some((kw) => lowerName.includes(kw));
    const isFemale = femaleKeywords.some((kw) => lowerName.includes(kw));
    return isMale && !isFemale ? 'male' : 'female';
  };

  const genderMatches = langMatches.filter((v) => getVoiceGender(v) === character.gender);
  const eligibleVoices = genderMatches.length > 0 ? genderMatches : langMatches;

  const nameKeywordMatch = eligibleVoices.find((v) => {
    const lowerName = v.name.toLowerCase();
    const charNameWords = character.name.toLowerCase().replace('prof.', '').replace('dr.', '').trim().split(' ');
    return charNameWords.some((word) => word.length > 2 && lowerName.includes(word));
  });

  if (nameKeywordMatch) return nameKeywordMatch;

  const hash = character.id.split('').reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 1), 0);
  return eligibleVoices[hash % eligibleVoices.length];
}
