declare module 'qrcode-svg' {
  type Options = {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    ecl?: 'L' | 'M' | 'Q' | 'H';
    join?: boolean;
    pretty?: boolean;
  };

  export default class QRCode {
    constructor(options: string | Options);
    svg(): string;
  }
}
