import icon1 from '../assets/images/bot_icon_variant1_1788087566503.jpg';
import icon2 from '../assets/images/bot_icon_variant2_1788087589432.jpg';
import icon3 from '../assets/images/bot_icon_variant3_1788087602393.jpg';

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
    id: 'variant-1',
    title: 'Вариант 1: Хромированный Shure 55',
    titleEn: 'Variant 1: Chrome Shure 55 Mic',
    description: 'Винтажный вещательный микрофон на фоне газетных полос в теплом студийном свете',
    descriptionEn: 'Vintage broadcast microphone against newspaper broadsheet in warm studio lighting',
    src: icon1,
    style: 'Классический ретро-хром и печатная пресса',
  },
  {
    id: 'variant-2',
    title: 'Вариант 2: Серебряный ленточный микрофон',
    titleEn: 'Variant 2: Silver Ribbon Mic',
    description: 'Элегантный дикторский ретро-микрофон на настольной стойке с мягко размытыми статьями',
    descriptionEn: 'Elegant retro announcer microphone on desktop stand with soft-focus articles',
    src: icon2,
    style: 'Эдиториал и глубокий радио-стиль',
  },
  {
    id: 'variant-3',
    title: 'Вариант 3: Латунный студийный микрофон',
    titleEn: 'Variant 3: Brass Radio Announcer',
    description: 'Золотисто-латунный дикторский микрофон радиостанции на текстурном газетном фоне',
    descriptionEn: 'Golden brass radio announcer microphone against textured newsprint background',
    src: icon3,
    style: 'Премиальная латунь и контрастное освещение',
  },
];
