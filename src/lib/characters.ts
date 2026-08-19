export interface TeacherCharacter {
  id: string;
  name: string;
  gender: 'male' | 'female';
  appearance: string;
  imageUrl: string;
  preferredLangs?: string[];
}

export const TEACHER_CHARACTERS: TeacherCharacter[] = [
  {
    id: 'asian-female-1',
    name: 'Prof. Li',
    gender: 'female',
    appearance: 'A young East Asian female professor with refined, realistic facial features, wearing stylish modern wire-rimmed glasses, a crisp white button-down shirt, and a sharply tailored navy blue blazer.',
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['zh', 'ja', 'ko', 'en-US']
  },
  {
    id: 'mediterranean-male-1',
    name: 'Dr. Marco',
    gender: 'male',
    appearance: 'A middle-aged Mediterranean male professor with salt-and-pepper hair and a neatly trimmed beard. He is wearing classic black-rimmed glasses and a sophisticated charcoal tweed blazer over a light blue shirt.',
    imageUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['it', 'es', 'fr', 'pt']
  },
  {
    id: 'african-female-1',
    name: 'Prof. Amara',
    gender: 'female',
    appearance: 'A professional African American female professor with a confident expression. She has neatly styled natural hair and is wearing elegant gold earrings, a tailored cream-colored blazer, and a modern silk blouse.',
    imageUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['en-GB', 'en-US', 'sw', 'ng', 'ke', 'en-KE']
  },
  {
    id: 'nordic-male-1',
    name: 'Dr. Soren',
    gender: 'male',
    appearance: 'A young Nordic male professor with sharp, tech-forward features and short blonde hair. He is wearing a minimalist dark grey turtleneck sweater and thin-frame glasses, projecting a clean, modern academic look.',
    imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['de', 'sv', 'no', 'da', 'fi']
  },
  {
    id: 'south-asian-female-1',
    name: 'Prof. Anaya',
    gender: 'female',
    appearance: 'A sophisticated South Asian female professor with long dark hair. She is wearing elegant traditional-professional fusion attire, stylish glasses, and a sharp black blazer, looking directly and confidently into the camera.',
    imageUrl: 'https://images.unsplash.com/photo-1573497161161-c3e73707e25c?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['hi', 'bn', 'en-IN', 'ta', 'te']
  },
  {
    id: 'hispanic-male-1',
    name: 'Dr. Carlos',
    gender: 'male',
    appearance: 'A warm and intellectual Hispanic male professor with a friendly smile and expressive eyes. He is wearing a tailored brown corduroy blazer over a crisp white shirt, with classic academic wire-frame glasses.',
    imageUrl: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['es', 'pt', 'en-US']
  },
  {
    id: 'african-male-1',
    name: 'Prof. Okoro',
    gender: 'male',
    appearance: 'A distinguished African male professor with a commanding presence and silver-flecked hair. He is wearing a sharp charcoal suit with a white shirt and a refined silk tie.',
    imageUrl: 'https://images.unsplash.com/photo-1531384441138-2736e62e0919?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['en-NG', 'en-GB', 'sw', 'ke', 'en-KE']
  },
  {
    id: 'western-female-1',
    name: 'Dr. Sarah',
    gender: 'female',
    appearance: 'A sharp, articulate Western female professor with blonde hair tied back. She is wearing modern black-rimmed glasses and a tailored grey blazer over a crisp white blouse.',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['en-US', 'en-CA', 'en-AU']
  },
  {
    id: 'asian-male-1',
    name: 'Prof. Tanaka',
    gender: 'male',
    appearance: 'An experienced East Asian male professor with a kind but serious demeanor. He has neatly styled grey hair and is wearing a classic navy suit with tortoiseshell glasses.',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['ja', 'zh', 'en-US']
  },
  {
    id: 'middle-eastern-female-1',
    name: 'Dr. Zoya',
    gender: 'female',
    appearance: 'A young and brilliant Middle Eastern female professor with expressive dark eyes and a confident stance. She is wearing a modern tailored outfit with elegant jewelry and professional glasses.',
    imageUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['ar', 'fa', 'tr', 'en-GB']
  },
  {
    id: 'european-male-1',
    name: 'Prof. Hans',
    gender: 'male',
    appearance: 'A distinguished European male professor with white hair and a scholarly look. He is wearing a tweed sports coat over a turtleneck and classic round academic glasses.',
    imageUrl: 'https://images.unsplash.com/photo-1522529599102-193c0d76b5b6?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['de', 'nl', 'fr', 'en-GB']
  },
  {
    id: 'tech-female-1',
    name: 'Dr. Yuki',
    gender: 'female',
    appearance: 'A cutting-edge tech-focused Japanese female professor with a minimalist aesthetic. She is wearing clean white tech-wear fabric and thin futuristic glasses, looking directly into the camera.',
    imageUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?q=80&w=1000&auto=format&fit=crop',
    preferredLangs: ['ja', 'en-US']
  }
];

export function getCharacterForVoice(voice: SpeechSynthesisVoice | null): TeacherCharacter {
  if (!voice) return TEACHER_CHARACTERS[0];

  const voiceName = voice.name;
  const voiceLang = voice.lang;
  const lowerName = voiceName.toLowerCase();
  
  // Comprehensive voice gender detection
  const maleKeywords = [
    'male', 'david', 'mark', 'soren', 'carlos', 'guy', 'andrew', 'brian', 
    'james', 'peter', 'thomas', 'daniel', 'robert', 'paul', 'michael', 
    'joseph', 'charles', 'christopher', 'william', 'hans', 'okoro', 'tanaka',
    'henry', 'george', 'samuel', 'arthur', 'frank', 'richard',
    'juma', 'ali', 'bakari', 'hamisi', 'musa', 'omari'
  ];
  
  const femaleKeywords = [
    'female', 'li', 'amara', 'anaya', 'zoya', 'sarah', 'yuki', 'monica', 
    'linda', 'mary', 'susan', 'jessica', 'elizabeth', 'karen', 'nancy', 
    'lisa', 'betty', 'helen', 'sandra', 'sarah', 'anna', 'emma', 'olivia',
    'asha', 'fatuma', 'rehema', 'zuwena', 'neema', 'zawadi', 'imani'
  ];

  let isMale = maleKeywords.some(kw => lowerName.includes(kw));
  let isFemale = femaleKeywords.some(kw => lowerName.includes(kw));

  // Determine gender (default to female if ambiguous as most standard voices are female)
  const gender = isMale && !isFemale ? 'male' : 'female';
  
  // Filter characters by gender
  const eligibleCharacters = TEACHER_CHARACTERS.filter(c => c.gender === gender);
  
  // Higher priority: Language/Region matching
  const regionalMatch = eligibleCharacters.find(c => 
    c.preferredLangs?.some(lang => voiceLang.toLowerCase().includes(lang.toLowerCase()))
  );
  
  if (regionalMatch) return regionalMatch;

  // Fallback: Consistent hash based on the voice name
  const hash = voiceName.split('').reduce((acc, char, index) => {
    return acc + (char.charCodeAt(0) * (index + 1));
  }, 0);
  
  return eligibleCharacters[hash % eligibleCharacters.length];
}

export function getVoiceForCharacter(
  character: TeacherCharacter,
  voices: SpeechSynthesisVoice[],
  currentLang: string
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const targetLangPrefix = currentLang.toLowerCase() === "sw" ? "sw" : "en";
  
  // 1. Filter voices by language match (primary choice)
  let langMatches = voices.filter(v => {
    const l = v.lang.toLowerCase();
    if (targetLangPrefix === "sw") {
      return l.startsWith("sw") || v.name.toLowerCase().includes("swahili") || l.startsWith("en-ke");
    } else {
      return l.startsWith(targetLangPrefix);
    }
  });

  if (langMatches.length === 0) {
    // If no specific language match, allow any voice
    langMatches = voices;
  }

  // 2. Filter language matches by gender of the character
  const maleKeywords = [
    'male', 'david', 'mark', 'soren', 'carlos', 'guy', 'andrew', 'brian', 
    'james', 'peter', 'thomas', 'daniel', 'robert', 'paul', 'michael', 
    'joseph', 'charles', 'christopher', 'william', 'hans', 'okoro', 'tanaka',
    'henry', 'george', 'samuel', 'arthur', 'frank', 'richard',
    'juma', 'ali', 'bakari', 'hamisi', 'musa', 'omari'
  ];
  
  const femaleKeywords = [
    'female', 'li', 'amara', 'anaya', 'zoya', 'sarah', 'yuki', 'monica', 
    'linda', 'mary', 'susan', 'jessica', 'elizabeth', 'karen', 'nancy', 
    'lisa', 'betty', 'helen', 'sandra', 'sarah', 'anna', 'emma', 'olivia',
    'asha', 'fatuma', 'rehema', 'zuwena', 'neema', 'zawadi', 'imani'
  ];

  const getVoiceGender = (v: SpeechSynthesisVoice): 'male' | 'female' => {
    const lowerName = v.name.toLowerCase();
    const isMale = maleKeywords.some(kw => lowerName.includes(kw));
    const isFemale = femaleKeywords.some(kw => lowerName.includes(kw));
    return isMale && !isFemale ? 'male' : 'female';
  };

  const genderMatches = langMatches.filter(v => getVoiceGender(v) === character.gender);
  const eligibleVoices = genderMatches.length > 0 ? genderMatches : langMatches;

  // 3. To distribute different voices among different characters:
  // First, see if any voice name actually contains a name or preferred language keyword of the character
  const nameKeywordMatch = eligibleVoices.find(v => {
    const lowerName = v.name.toLowerCase();
    const charNameWords = character.name.toLowerCase().replace('prof.', '').replace('dr.', '').trim().split(' ');
    return charNameWords.some(word => word.length > 2 && lowerName.includes(word));
  });

  if (nameKeywordMatch) return nameKeywordMatch;

  // Otherwise, use a deterministic hash of character.id to distribute the voices
  const hash = character.id.split('').reduce((acc, char, index) => {
    return acc + (char.charCodeAt(0) * (index + 1));
  }, 0);

  return eligibleVoices[hash % eligibleVoices.length];
}

