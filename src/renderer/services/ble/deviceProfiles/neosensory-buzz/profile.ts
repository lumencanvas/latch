import { defineDeviceProfile } from '../../defineDeviceProfile'
import { BUZZ_SERVICE, BUZZ_WRITE_CHAR, BUZZ_NOTIFY_CHAR } from '../../neosensory/buzzProtocol'

// Neosensory Buzz — a 4-motor haptic wristband that speaks the Nordic UART Service (NUS).
//
// Recognition note (same lesson the escpos-printer profile documents): NUS is a GENERIC serial
// service used by many devices, so we do NOT recognize the Buzz by its service — that would
// false-positive. We recognize by the "Buzz" name prefix; the NUS service is requested (so the
// chooser surfaces the band) and listed only as an optionalService for the gesture-free connect.

export default defineDeviceProfile({
  id: 'neosensory-buzz',
  label: 'Neosensory Buzz (haptic wristband)',
  icon: 'vibrate',
  vendor: 'Neosensory',
  description: 'Haptic feedback wristband with four vibration motors, driven over Bluetooth.',
  match: {
    namePrefix: ['Buzz', 'NeoBuzz', 'Neosensory'],
  },
  request: {
    filters: [{ namePrefix: 'Buzz' }, { services: [BUZZ_SERVICE] }],
    optionalServices: [BUZZ_SERVICE, BUZZ_WRITE_CHAR, BUZZ_NOTIFY_CHAR],
  },
  suggests: [{ nodeType: 'neosensory-buzz', label: 'Neosensory Buzz', primary: true }],
})
