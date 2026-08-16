import { NativeModule, requireNativeModule } from 'expo';

export type NativeInfoModuleEvents = {
  onChange: (params: { value: string }) => void;
};

declare class NativeInfoModuleType extends NativeModule<NativeInfoModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<NativeInfoModuleType>('NativeInfoModule');
