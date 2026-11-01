/**
 * CameraCapture.tsx - Chụp trực tiếp bằng camera điện thoại / webcam, chụp liên tiếp nhiều tờ.
 * Lưu ý: trình duyệt chỉ cho mở camera khi trang chạy bằng HTTPS (hoặc localhost).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCcw, X, Check, Trash2 } from 'lucide-react';

interface Props {
  onDone: (files: File[]) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<Props> = ({ onDone, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [flash, setFlash] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      stop();
      setError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Trình duyệt này không hỗ trợ camera, hoặc trang chưa chạy bằng HTTPS.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Bạn chưa cho phép dùng camera. Hãy bấm biểu tượng ổ khóa trên thanh địa chỉ và cho phép camera.'
            : `Không mở được camera: ${e?.message || e}`,
        );
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [facing]);

  // Giải phóng URL xem trước khi đóng
  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `anh-chup-${shots.length + 1}.jpg`, { type: 'image/jpeg' });
      setShots((prev) => [...prev, { file, url: URL.createObjectURL(blob) }]);
      setFlash(true);
      setTimeout(() => setFlash(false), 120);
    }, 'image/jpeg', 0.92);
  };

  const finish = () => { stop(); onDone(shots.map((s) => s.file)); };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <button onClick={() => { stop(); onClose(); }} className="p-2" aria-label="Đóng"><X className="w-6 h-6" /></button>
        <span className="text-sm font-semibold">Chụp đề thi ({shots.length} ảnh)</span>
        <button onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} className="p-2" aria-label="Đổi camera">
          <RefreshCcw className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <p className="text-white text-sm text-center px-6 max-w-md">{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />
        )}
        {flash && <div className="absolute inset-0 bg-white/70" />}
      </div>

      {shots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 bg-black/80">
          {shots.map((s, i) => (
            <div key={s.url} className="relative shrink-0">
              <img src={s.url} alt={`Ảnh ${i + 1}`} className="h-16 w-12 object-cover rounded border border-white/30" />
              <button onClick={() => { URL.revokeObjectURL(s.url); setShots((p) => p.filter((x) => x !== s)); }}
                className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5" aria-label="Xóa ảnh">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-around p-4 bg-black">
        <span className="w-20 text-xs text-white/60 text-center">Chụp từng tờ, mỗi tờ một ảnh</span>
        <button onClick={capture} disabled={!!error}
          className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center active:scale-95 disabled:opacity-40" aria-label="Chụp">
          <Camera className="w-7 h-7 text-slate-800" />
        </button>
        <button onClick={finish} disabled={shots.length === 0}
          className="w-20 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-40">
          <Check className="w-4 h-4" /> Xong
        </button>
      </div>
    </div>
  );
};
