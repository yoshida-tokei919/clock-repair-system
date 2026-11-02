import { Font } from '@react-pdf/renderer';

if (typeof window !== 'undefined') {
  Font.register({ family: 'Noto Sans JP', src: '/fonts/NotoSansJP-Regular.otf' });
}
