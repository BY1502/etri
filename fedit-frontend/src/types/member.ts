export enum theme {
  'dark' = 'dark',
  'light' = 'light',
  'ndxproDark' = 'ndxpro-dark',
  'ndxproLight' = 'ndxpro-light',
}
export enum fontSize {
  'small' = '11px',
  'medium' = '12px',
  'large' = '13px',
}

export interface memberDTO {
  id: number;
  memberId: string;
  name: string;
  hp: string;
  authType: string;
  status: string;
  email: string;
  createAt: string;
  theme: theme;
  fontSize: fontSize;
}

export interface IThemes {
  fontSize: string;
}

export interface authMemberDTO {
  id: number;
  authType: string;
  member: memberDTO;
}
