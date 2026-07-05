using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class BlockKeys {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;

    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;

    public static void Main() {
        _hookID = SetHook(_proc);
        Console.WriteLine("Hook installed.");
        Application.Run();
        UnhookWindowsHookEx(_hookID);
    }

    private static IntPtr SetHook(LowLevelKeyboardProc proc) {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            return SetWindowsHookEx(WH_KEYBOARD_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN)) {
            KBDLLHOOKSTRUCT kbStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            uint vkCode = kbStruct.vkCode;
            bool altDown = (kbStruct.flags & 32) != 0;
            bool ctrlDown = (GetAsyncKeyState(17) & 0x8000) != 0 || (GetAsyncKeyState(162) & 0x8000) != 0 || (GetAsyncKeyState(163) & 0x8000) != 0;

            // Block Windows Keys: LWIN (91), RWIN (92)
            if (vkCode == 91 || vkCode == 92) {
                return (IntPtr)1;
            }
            // Block ALT+TAB (TAB=9)
            if (altDown && vkCode == 9) {
                return (IntPtr)1;
            }
            // Block ALT+ESC (ESC=27)
            if (altDown && vkCode == 27) {
                return (IntPtr)1;
            }
            // Block CTRL+ESC (Start Menu shortcut)
            if (ctrlDown && vkCode == 27) {
                return (IntPtr)1;
            }
            // Block ALT+F4 (F4=115)
            if (altDown && vkCode == 115) {
                return (IntPtr)1;
            }
            // Block ALT+SPACE (SPACE=32)
            if (altDown && vkCode == 32) {
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
}
