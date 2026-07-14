import { defineDeviceProfile } from '../../defineDeviceProfile'

// Muse (InteraXon) EEG headband — Muse 2 / Muse S. GATT service 0xfe8d; all
// characteristics are 273e{XXXX}-4c4d-454d-96be-f03bac821358 (control 0001,
// telemetry 000b, gyro 0009, accel 000a, EEG 0003-0007 = TP9/AF7/AF8/TP10/AUX,
// PPG 000f-0011). EEG streams at 256 Hz, 12 samples/notification, 12-bit packed,
// 0.48828125 µV/LSB. Recognized by the fe8d service and the "Muse" name prefix;
// suggests the muse-eeg node (C1), falling back to generic BLE nodes if absent.
const MUSE_SERVICE = 0xfe8d

export default defineDeviceProfile({
  id: 'muse',
  label: 'Muse (EEG headband)',
  icon: 'brain',
  vendor: 'InteraXon',
  description: 'Muse 2 / Muse S EEG headband — 4-channel EEG (TP9/AF7/AF8/TP10) at 256 Hz, plus PPG and IMU.',
  match: {
    services: [MUSE_SERVICE],
    namePrefix: ['Muse'],
  },
  request: {
    // The fe8d service is not always advertised, so allow the name prefix too;
    // optionalServices must include fe8d so the node can reach every characteristic.
    filters: [{ services: [MUSE_SERVICE] }, { namePrefix: 'Muse' }],
    optionalServices: [MUSE_SERVICE],
  },
  suggests: [{ nodeType: 'muse-eeg', label: 'Muse EEG', primary: true }],
})
