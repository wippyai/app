import type { Ref } from 'vue';
export declare function useAttentionElement(element: Ref<HTMLElement | null>, publish: () => ((element: HTMLElement | null) => void) | undefined): void;
