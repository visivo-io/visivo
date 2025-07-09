// Mock for html2canvas-pro module
export default jest.fn(() => Promise.resolve({
  toBlob: jest.fn((callback) => {
    // Mock blob creation
    const blob = new Blob(['mock-image'], { type: 'image/png' });
    callback(blob);
  })
}));