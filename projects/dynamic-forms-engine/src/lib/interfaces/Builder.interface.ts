// src/interfaces/builder.interface.ts
export type CssFramework = 'tailwind' | 'bootstrap' | 'none' | 'custom';

export interface StyleConfig {
  colSpan?: number;
  gap?: number;
  padding?: number;
  margin?: number;
  bgColor?: string;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  justifyContent?: 'start' | 'center' | 'end' | 'between' | 'around'; 
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
  display?: 'block' | 'flex' | 'grid';
  width?: 'full' | 'auto';
}

export interface BuilderElement {
  id: string;
  type: string; // 'section', 'div', 'button', 'input', etc.
  parentId?: string | null;
  children?: BuilderElement[];
  content?: string;
  style: StyleConfig;
  customClasses?: string;
  customAttributes?: string;
  controlName?: string;
  inputType?: string;
  placeholder?: string;
  validation?: any;
  actionName?: string;
  disableWhen?: string;
  hideIf?: string;
  showIf?: string;
  menuItems?: any[];
}