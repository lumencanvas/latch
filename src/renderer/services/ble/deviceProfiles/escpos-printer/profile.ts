import { defineDeviceProfile } from '../../defineDeviceProfile'

// ESC/POS BLE thermal printers (Phomemo M02/T02, ORGBRO X3, and BLE-serial
// printers). Transports vary: Phomemo's own FF00 service (write FF02), or a
// generic BLE-serial bridge — Nordic UART (NUS 6e400001, write 6e400002), ISSC,
// HM-10. Printing is ESC/POS `GS v 0` raster, 384 px = 48 bytes/row, MSB-first.
//
// Recognition note (review correction): NUS is a GENERIC serial service used by
// many non-printer devices, so we do NOT recognize a printer by NUS alone — that
// would false-positive. We recognize by the Phomemo-specific FF00 service or a
// printer name prefix; NUS/ISSC printers are reached via the explicit "thermal
// printer" scan card (which requests NUS), and NUS is only an optionalService.
const PHOMEMO_SERVICE = 0xff00
const PHOMEMO_WRITE = 0xff02
const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'

export default defineDeviceProfile({
  id: 'escpos-printer',
  label: 'Thermal printer (ESC/POS)',
  icon: 'printer',
  description: 'BLE thermal receipt/label printer (Phomemo M02/T02, ORGBRO X3, and ESC/POS BLE-serial printers).',
  match: {
    // FF00 is Phomemo-specific; name prefixes catch the common models. NUS is
    // deliberately excluded from match (too generic) but included in request below.
    services: [PHOMEMO_SERVICE],
    namePrefix: ['M02', 'T02', 'Phomemo', 'MX', 'X3', 'ORGBRO'],
  },
  request: {
    filters: [
      { services: [PHOMEMO_SERVICE] },
      { services: [NUS_SERVICE] },
      { namePrefix: 'M02' },
      { namePrefix: 'T02' },
      { namePrefix: 'Phomemo' },
    ],
    optionalServices: [PHOMEMO_SERVICE, PHOMEMO_WRITE, NUS_SERVICE, NUS_WRITE],
  },
  suggests: [{ nodeType: 'thermal-printer', label: 'Thermal Printer', primary: true }],
})
