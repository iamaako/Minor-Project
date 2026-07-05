using System;
using System.Management;

class USBDetector {
    static void Main() {
        try {
            // Watch for Removable Drives (Pendrives)
            WqlEventQuery insertQuery = new WqlEventQuery("SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_LogicalDisk' AND TargetInstance.DriveType = 2");
            ManagementEventWatcher insertWatcher = new ManagementEventWatcher(insertQuery);
            insertWatcher.EventArrived += new EventArrivedEventHandler(DeviceInsertedEvent);
            insertWatcher.Start();

            // Watch for Windows Portable Devices (Mobile Phones over MTP/PTP)
            WqlEventQuery pnpInsertQuery = new WqlEventQuery("SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity' AND TargetInstance.PNPClass = 'WPD'");
            ManagementEventWatcher pnpInsertWatcher = new ManagementEventWatcher(pnpInsertQuery);
            pnpInsertWatcher.EventArrived += new EventArrivedEventHandler(DeviceInsertedEvent);
            pnpInsertWatcher.Start();

            Console.WriteLine("USB_DETECTOR_STARTED");
            
            // Keep the application running indefinitely
            System.Threading.Thread.Sleep(System.Threading.Timeout.Infinite);
        } catch (Exception ex) {
            Console.WriteLine("ERROR: " + ex.Message);
        }
    }

    static void DeviceInsertedEvent(object sender, EventArrivedEventArgs e) {
        Console.WriteLine("USB_INSERTED");
    }
}
