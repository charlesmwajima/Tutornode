import React from 'react';
import { jsPDF } from 'jspdf';
import { BookOpen, Download, Trash2, PlayCircle } from 'lucide-react';

export interface SavedLessonItem {
  id?: string;
  topic: string;
  whiteboard_notes: string;
  teacher_dialogue: string;
  segments?: Array<{ content: string; speech: string; diagram_svg_code?: string; diagram_title?: string }>;
  structured_lesson?: any;
  diagram_svg_code?: string | null;
  video_scene?: string;
  video_keyword?: string;
  is_exam_revision?: boolean;
}

interface HistoryArchiveProps {
  lessons: SavedLessonItem[];
  language: 'en' | 'sw';
  onLoadLesson: (lesson: SavedLessonItem) => void;
  onDeleteLesson: (lessonId: string) => void;
}

export function exportLessonToPdf(topic: string, whiteboardNotes: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`TutorNode Study Notes: ${topic || 'Lesson'}`, margin, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const cleanText = whiteboardNotes.replace(/[#*`]/g, '');
  const lines = doc.splitTextToSize(cleanText, maxWidth);

  let y = 88;
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 16;
  }

  doc.save(`TutorNode_${(topic || 'Lesson').replace(/\s+/g, '_').slice(0, 40)}.pdf`);
}

export const HistoryArchive: React.FC<HistoryArchiveProps> = ({
  lessons,
  language,
  onLoadLesson,
  onDeleteLesson,
}) => {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 sm:p-6">
        <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
          <BookOpen className="text-blue-400" size={20} />
          {language === 'sw' ? 'Kumbukumbu ya Masomo' : 'Lesson Archive'}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Revisit saved AI lessons, resume smartboard playback, or download clean PDF study notes.
        </p>
      </div>

      {lessons.length === 0 ? (
        <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-10 text-center text-sm text-slate-400">
          No saved lessons yet. Generate a lesson on the Classroom Board and it will appear here automatically.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lessons.map((lesson, idx) => (
            <div
              key={lesson.id || idx}
              className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-white line-clamp-2">{lesson.topic}</h3>
                  {lesson.is_exam_revision && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">
                      Exam
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 line-clamp-3 mt-2 leading-relaxed">
                  {lesson.whiteboard_notes.replace(/[#*`]/g, '').slice(0, 180)}...
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => onLoadLesson(lesson)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <PlayCircle size={13} /> Open Lesson
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => exportLessonToPdf(lesson.topic, lesson.whiteboard_notes)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1"
                  >
                    <Download size={13} /> PDF
                  </button>
                  {lesson.id && (
                    <button
                      type="button"
                      onClick={() => onDeleteLesson(lesson.id!)}
                      aria-label="Delete saved lesson"
                      className="p-2 rounded-xl bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-300"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
