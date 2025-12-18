
import { invoke } from '@tauri-apps/api/core';

export const useDesktopControl = () => {
    const moveMouse = async (x: number, y: number) => {
        try {
            await invoke('move_mouse', { x, y });
        } catch (error) {
            console.error('Failed to move mouse:', error);
        }
    };

    const clickMouse = async (button: 'left' | 'right' | 'middle') => {
        try {
            await invoke('click_mouse', { button });
        } catch (error) {
            console.error('Failed to click mouse:', error);
        }
    };

    const typeText = async (text: string) => {
        try {
            await invoke('type_text', { text });
        } catch (error) {
            console.error('Failed to type text:', error);
        }
    };

    return {
        moveMouse,
        clickMouse,
        typeText,
    };
};
