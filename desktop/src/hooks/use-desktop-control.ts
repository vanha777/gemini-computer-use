
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

    const mouseDown = async (button: 'left' | 'right' | 'middle') => {
        try {
            await invoke('mouse_down', { button });
        } catch (error) {
            console.error('Failed to mouse down:', error);
        }
    };

    const mouseUp = async (button: 'left' | 'right' | 'middle') => {
        try {
            await invoke('mouse_up', { button });
        } catch (error) {
            console.error('Failed to mouse up:', error);
        }
    };

    const scroll = async (deltaX: number, deltaY: number) => {
        try {
            await invoke('scroll_wheel', { deltaX, deltaY });
        } catch (error) {
            console.error('Failed to scroll:', error);
        }
    };

    const pressKey = async (key: string, modifiers: string[] = []) => {
        try {
            await invoke('press_key', { key, modifiers });
        } catch (error) {
            console.error('Failed to press key:', error);
        }
    };

    return {
        moveMouse,
        clickMouse,
        typeText,
        mouseDown,
        mouseUp,
        scroll,
        pressKey,
    };
};
