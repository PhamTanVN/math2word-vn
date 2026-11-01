import React, { useState, useEffect } from 'react';
import {
  Wand2,
  RotateCw,
  Sun,
  Contrast,
  Check,
  X,
  FileCheck,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { enhanceDocumentImage, EnhanceOptions, DEFAULT_ENHANCE_OPTIONS } from '../utils/imageEnhancer.ts';

interface ImageEnhanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalImage: string;
  questionNumber?: string;
  onApply: (enhancedDataUrl: string, applyToAll?: boolean) => void;
}

export const ImageEnhanceModal: React.FC<ImageEnhanceModalProps> = ({
  isOpen,
  onClose,
  originalImage,
  questionNumber = 'Câu hỏi',
  onApply,
}) => {
  const [options, setOptions] = useState<EnhanceOptions>({ ...DEFAULT_ENHANCE_OPTIONS });
  const [previewUrl, setPreviewUrl] = useState<string>(originalImage);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen && originalImage) {
      applyEnhancement(options);
    }
  }, [isOpen, originalImage]);

  const applyEnhancement = async (currentOpts: EnhanceOptions) => {
    try {
      setIsProcessing(true);
      const res = await enhanceDocumentImage(originalImage, currentOpts);
      setPreviewUrl(res.dataUrl);
    } catch (err) {
      console.error('Lỗi lọc ảnh:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOptionChange = (key: keyof EnhanceOptions, value: any) => {
    const updated = { ...options, [key]: value };
    setOptions(updated);
    applyEnhancement(updated);
  };

  const applyPreset = (presetName: 'auto' | 'mono' | 'color' | 'orig') => {
    let newOpts: EnhanceOptions;
    if (presetName === 'auto') {
      newOpts = {
        shadowRemoval: 80,
        whiteLevel: 75,
        contrast: 65,
        monochrome: false,
        sharpen: true,
        rotation: options.rotation,
      };
    } else if (presetName === 'mono') {
      newOpts = {
        shadowRemoval: 90,
        whiteLevel: 80,
        contrast: 80,
        monochrome: true,
        sharpen: true,
        rotation: options.rotation,
      };
    } else if (presetName === 'color') {
      newOpts = {
        shadowRemoval: 65,
        whiteLevel: 60,
        contrast: 50,
        monochrome: false,
        sharpen: true,
        rotation: options.rotation,
      };
    } else {
      // Original
      newOpts = {
        shadowRemoval: 0,
        whiteLevel: 0,
        contrast: 0,
        monochrome: false,
        sharpen: false,
        rotation: 0,
      };
    }
    setOptions(newOpts);
    applyEnhancement(newOpts);
  };

  const rotate90 = () => {
    const newRot = ((options.rotation || 0) + 90) % 360;
    handleOptionChange('rotation', newRot);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Làm Phẳng Hình &amp; Trắng Đều Nền ({questionNumber})
              </h3>
              <p className="text-xs text-slate-500">
                Khử bóng mờ khi chụp điện thoại, tẩy trắng giấy và làm sắc nét các đường vẽ hình học
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 mr-1">Chế độ sẵn có:</span>
            <button
              onClick={() => applyPreset('auto')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Tự động làm trắng &amp; khử bóng</span>
            </button>
            <button
              onClick={() => applyPreset('mono')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition border border-slate-200 flex items-center gap-1.5"
            >
              <FileCheck className="w-3.5 h-3.5 text-slate-600" />
              <span>Trắng đen in ấn</span>
            </button>
            <button
              onClick={() => applyPreset('color')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition border border-slate-200 flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Giữ màu nét vẽ</span>
            </button>
            <button
              onClick={() => applyPreset('orig')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
            >
              Ảnh gốc
            </button>

            <button
              onClick={rotate90}
              className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition flex items-center gap-1"
              title="Xoay 90 độ"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Xoay 90°</span>
            </button>
          </div>

          {/* Interactive Before & After Visual Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Before (Original) */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-100/60 flex flex-col items-center">
              <span className="text-xs font-bold text-slate-500 mb-2 self-start flex items-center gap-1">
                <span>Ảnh chụp gốc (Có bóng / tối)</span>
              </span>
              <div className="w-full h-64 flex items-center justify-center bg-slate-200/50 rounded-lg overflow-hidden border border-slate-200 p-2">
                <img
                  src={originalImage}
                  alt="Ảnh gốc"
                  className="max-h-full max-w-full object-contain shadow-xs rounded"
                />
              </div>
            </div>

            {/* After (Enhanced) */}
            <div className="border-2 border-indigo-200 rounded-xl p-3 bg-indigo-50/20 flex flex-col items-center relative">
              <span className="text-xs font-bold text-indigo-700 mb-2 self-start flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kết quả: Nền trắng đều &amp; nét vẽ đậm</span>
              </span>

              <div className="w-full h-64 flex items-center justify-center bg-white rounded-lg overflow-hidden border border-slate-200 p-2 relative">
                {isProcessing && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex items-center justify-center z-10 text-xs font-medium text-indigo-700">
                    Đang xử lý làm phẳng...
                  </div>
                )}
                <img
                  src={previewUrl}
                  alt="Ảnh sau khi làm phẳng và trắng"
                  className="max-h-full max-w-full object-contain rounded"
                />
              </div>
            </div>
          </div>

          {/* Fine-Tuning Sliders */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1.5">
                <span>Khử bóng chụp (Shadow Flatten):</span>
                <span className="font-mono text-indigo-600">{options.shadowRemoval}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={options.shadowRemoval}
                onChange={(e) => handleOptionChange('shadowRemoval', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Xóa dải tối / bóng điện thoại trên trang</span>
            </div>

            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1.5">
                <span>Tẩy trắng giấy (Paper White):</span>
                <span className="font-mono text-indigo-600">{options.whiteLevel}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={options.whiteLevel}
                onChange={(e) => handleOptionChange('whiteLevel', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Đưa nền xám/vàng về màu trắng #FFF tinh khiết</span>
            </div>

            <div>
              <div className="flex justify-between font-semibold text-slate-700 mb-1.5">
                <span>Đậm nét hình vẽ (Contrast):</span>
                <span className="font-mono text-indigo-600">{options.contrast}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={options.contrast}
                onChange={(e) => handleOptionChange('contrast', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400 mt-0.5 block">Làm rõ nét mực, đường nét đứt và chữ cái</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition"
          >
            Hủy bỏ
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onApply(previewUrl, true)}
              className="px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition flex items-center gap-1.5"
              title="Áp dụng cùng độ trắng & khử bóng cho toàn bộ hình học trong đề"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Áp dụng cho tất cả hình</span>
            </button>

            <button
              onClick={() => onApply(previewUrl, false)}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Áp dụng hình này</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
