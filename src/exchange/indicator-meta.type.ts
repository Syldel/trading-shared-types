export interface IndicatorOption<T extends string | number> {
  label: string;
  value: T;
}

interface IndicatorParameterBase {
  name: string;
  label: string;
}

export interface NumberIndicatorParameter extends IndicatorParameterBase {
  type: 'number';
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface StringIndicatorParameter extends IndicatorParameterBase {
  type: 'string';
  defaultValue: string;
  placeholder?: string;
}

export interface SelectIndicatorParameter<
  T extends string | number = string,
> extends IndicatorParameterBase {
  type: 'select';
  defaultValue: T;
  options: IndicatorOption<T>[];
}

export type IndicatorParameter =
  | NumberIndicatorParameter
  | StringIndicatorParameter
  | SelectIndicatorParameter;

export interface IndicatorSubField {
  name: string;
  label: string;
}

export interface IndicatorMetadata {
  name: string;
  label: string;
  overlay: boolean;
  parameters: IndicatorParameter[];
  subFields?: IndicatorSubField[];
}