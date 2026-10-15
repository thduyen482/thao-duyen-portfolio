/* Cấu hình cửa hàng — sửa ở đây, không cần đụng vào shop.js.
   Giá sản phẩm đang là giá tạm, chờ bảng giá thật. */
window.SHOP_CONFIG = {
  // Để trống = chế độ demo (QR mờ, có nút giả lập xác nhận).
  bank: { bankId: 'BIDV', accountNo: '39510358831', accountName: 'LA THI THAO DUYEN', bankName: 'BIDV' },
  // URL Google Apps Script web app. Để trống = demo, không gửi đơn đi đâu.
  apiUrl: 'https://script.google.com/macros/s/AKfycbzMg6b1uMlFdbzknRmF1BNsnmkH9t8cuGNFHPUzs3Rq0XPoCFtA9qlc2C88l4IHCTYF/exec',
  holdMinutes: 30,

  services: [
    // Dịch vụ không ghi price = đặt lịch miễn phí, báo giá sau (không hiện QR).
    { id: 'ai-visual', name: 'AI Visual & Canva', unit: 'Gói 10 thiết kế' },
    { id: 'thiep-cuoi', name: 'Thiệp cưới online', unit: 'Một mẫu thiệp hoàn chỉnh' },
    { id: 'content-seo', name: 'Content Branding & SEO', unit: 'Gói một tháng' },
    { id: 'ai-agent', name: 'Giải pháp AI Agent', unit: 'Buổi tư vấn & demo' },
    { id: 'test-2k', name: 'Dịch vụ thử thanh toán', unit: 'Chỉ hiện với ?test=1', price: 2000, testOnly: true }
  ],
  timeSlots: ['09:00', '10:30', '14:00', '15:30', '19:30'],

  mochiPrice: 15000, // giá mỗi viên; giá hộp = số viên × giá viên
  mochiBoxSizes: [6, 8, 10, 12],
  mochiFlavors: [
    { name: 'Matcha', color: '#9cbf6b' },
    { name: 'Dâu tây', color: '#e9798f' },
    { name: 'Xoài', color: '#f4b942' },
    { name: 'Socola', color: '#6b3f2a', light: true },
    { name: 'Khoai môn', color: '#a78bc9' },
    { name: 'Đậu đỏ', color: '#a6403c', light: true },
    { name: 'Việt quất', color: '#5b5fa8', light: true },
    { name: 'Sầu riêng', color: '#e6d27a' },
    { name: 'Trà sữa', color: '#c99a6b' },
    { name: 'Dừa non', color: '#fbf3e4' },
    { name: 'Mè đen', color: '#3d3a38', light: true },
    { name: 'Đào', color: '#f6b39a' }
  ],

  products: [
    { id: 'lap-xuong-500', name: 'Lạp xưởng gác bếp', unit: 'Túi 500g', price: 250000 },
    { id: 'lap-xuong-1kg', name: 'Lạp xưởng gác bếp', unit: 'Túi 1kg', price: 480000 },
    { id: 'mien-dong-500', name: 'Miến dong Bắc Kạn', unit: 'Túi 500g', price: 55000 }
  ]
};
