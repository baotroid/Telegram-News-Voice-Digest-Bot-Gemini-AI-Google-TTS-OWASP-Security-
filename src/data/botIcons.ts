import icon1 from '../assets/images/bot_icon_variant1_1788087566503.jpg';
import iconSilverStandCircle from '../assets/images/avatar_silver_stand_circle_1788467491088.jpg';
import iconSilverRingStand from '../assets/images/avatar_silver_ring_stand_1788467529948.jpg';
import iconSilver30Deg from '../assets/images/avatar_silver_30deg_1788467161418.jpg';
import iconSilver30DegB from '../assets/images/avatar_silver_30deg_b_1788467176830.jpg';
import iconSilverPress from '../assets/images/avatar_silver_press_1788466885691.jpg';
import iconSilverClean from '../assets/images/avatar_silver_clean_1788466903058.jpg';
import iconCyberWave from '../assets/images/avatar_cyber_wave_1788466471736.jpg';
import iconGoldenMic from '../assets/images/avatar_golden_mic_1788466484627.jpg';
import iconHerald from '../assets/images/avatar_herald_broadcast_1788466507662.jpg';

export interface BotIconOption {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  src: string;
  style: string;
}

export const BOT_ICON_VARIANTS: BotIconOption[] = [
  {
    id: 'silver-stand-circle',
    title: 'Вариант 5 (Круг & Хром-подставка): Ракурс 30° в тонком хромированном кольце',
    titleEn: 'Variant 5 (Circle & Chrome Stand): 30° Angle in Sleek Chrome Rim',
    description: 'Винтажный серебристый микрофон повернут на 30 градусов и установлен на круглой хромированной настольной подставке. Сама аватарка оформлена в тонком полированном хромированном круге, а всё пространство за микрофоном заполнено белыми газетами.',
    descriptionEn: 'Vintage silver chrome microphone at 30 degrees mounted on a round chrome stand base, framed in a thin polished chrome circular rim with full white newsprint backdrop.',
    src: iconSilverStandCircle,
    style: 'Круглая аватарка в тонком хроме, круглая подставка, ракурс 30°',
  },
  {
    id: 'silver-ring-stand',
    title: 'Вариант 5D: Микрофон на круглой стойке в серебряном кольце',
    titleEn: 'Variant 5D: Silver Ring & Circular Desktop Stand',
    description: 'Изящное серебряное кольцо по контуру аватарки, круглая монолитная подставка микрофона, ракурс 30 градусов и плотный светлый газетный фон.',
    descriptionEn: 'Fine silver ring border framing the 30-degree microphone on circular desktop mount against white press.',
    src: iconSilverRingStand,
    style: 'Хромированное кольцо-рамка, настольная дикторская стойка',
  },
  {
    id: 'silver-30deg-fullpress',
    title: 'Вариант 5 (Без рамки): Хром в 3/4 & Газеты на весь фон',
    titleEn: 'Variant 5 (Frameless): Chrome 3/4 Angle & Full Press Background',
    description: 'Серебристый микрофон Shure 55 развёрнут на 30 градусов (вид в три четверти), задний фон полностью заполнен разворотами белых газет без пустых пробелов.',
    descriptionEn: 'Silver chrome broadcast microphone angled at 30 degrees showing dimensional depth. Background is completely covered with white newspaper broadsheets.',
    src: iconSilver30Deg,
    style: 'Поворот 30°, монохромный хром, 100% заполнение фона газетами',
  },
  {
    id: 'silver-30deg-clean',
    title: 'Вариант 5C: Дикторский микрофон 30° & Объёмная пресса',
    titleEn: 'Variant 5C: 30° Broadcast Mic & Dimensional Newsprint',
    description: 'Альтернативный ракурс под углом 30° с глубокими тенями на металле и сплошным ковром из аккуратных белых газетных полос на фоне.',
    descriptionEn: 'Alternative 30-degree angle with crisp metallic shadows and seamless white newspaper sheets covering the entire backdrop.',
    src: iconSilver30DegB,
    style: 'Ракурс 30°, сплошной газетный фон, мягкое студийное размытие',
  },
  {
    id: 'silver-press-clean',
    title: 'Вариант 5 (Прямой ракурс): Серебряный хром & Белые газеты',
    titleEn: 'Variant 5 (Front View): Silver Chrome & Clean White Press',
    description: 'Серебристый винтажный микрофон анфас в нейтральном холодном студийном свете без жёлтого ореола.',
    descriptionEn: 'Polished silver vintage microphone in neutral cool studio lighting with no yellow glow, front-facing.',
    src: iconSilverPress,
    style: 'Прямой ракурс, монохромный хром, белая бумага',
  },
  {
    id: 'silver-clean-minimal',
    title: 'Вариант 5B: Минималистичный серебряный диктор',
    titleEn: 'Variant 5B: Minimalist Silver Announcer',
    description: 'Крупный план хромированного микрофона с чётким силуэтом на фоне размытых белых газетных полос без лишних деталей.',
    descriptionEn: 'Centered close-up of a sleek silver chrome studio microphone against clean bright white unfolded newspapers.',
    src: iconSilverClean,
    style: 'Холодное серебро, акцент на чётком силуэте микрофона',
  },
  {
    id: 'cyber-pulse',
    title: 'Вариант 1: Неоновый AI-пульс и звуковая волна',
    titleEn: 'Variant 1: Neon Cyber Pulse & AI Wave',
    description: 'Яркое неоново-синее и маджента ядро искусственного интеллекта с расходящимися звуковыми импульсами на глубоком чёрном фоне.',
    descriptionEn: 'Vibrant neon electric blue and magenta AI neural core with pulsing soundwaves on obsidian background.',
    src: iconCyberWave,
    style: 'Неоновый киберпанк, высокий контраст',
  },
  {
    id: 'herald-broadcast',
    title: 'Вариант 2: Вестник Telegram & Звуковой луч',
    titleEn: 'Variant 2: Telegram Herald & Audio Beam',
    description: 'Современный 3D-значок в фирменных цветах: электрический синий силуэт вестника новостей в сочетании с энергичным теплым янтарно-оранжевым импульсом.',
    descriptionEn: 'Modern high-contrast app icon with electric sapphire blue and vivid warm orange audio broadcast waves.',
    src: iconHerald,
    style: 'Яркий контраст синего и оранжевого, фирменный стиль',
  },
  {
    id: 'golden-mic',
    title: 'Вариант 4: Золотой студийный микрофон',
    titleEn: 'Variant 4: Luxury Golden Studio Mic',
    description: 'Глянцевый золотой вещательный микрофон с ореолом радиоволн на фоне глубокого ночного ультрамарина.',
    descriptionEn: 'Gleaming gold broadcast microphone with halo radio waves on deep midnight navy.',
    src: iconGoldenMic,
    style: 'Премиальное золото и глубокий сапфир',
  },
  {
    id: 'vintage-press',
    title: 'Предыдущий Вариант 5 (Исходный с тёплым светом)',
    titleEn: 'Original Variant 5 (Warm Vintage Shure 55)',
    description: 'Исходный вариант с классическим тёплым янтарным освещением и плотным газетным текстом.',
    descriptionEn: 'Original version with warm amber lighting and dense newspaper text.',
    src: icon1,
    style: 'Ретро-радиовещание и тёплый свет',
  },
];
