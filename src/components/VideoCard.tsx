import { useState } from 'react';
import { analyzeVideoFrame } from '../services/aiAnalysisService';

interface VideoCardProps {
  video: Video;  // Pass the whole video object instead of just id and thumbnailUrl
}

export const VideoCard = ({ video }: VideoCardProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const handleAnalyze = async () => {
    try {
      setIsAnalyzing(true);
      if (!video.id) {
        throw new Error('Video ID is required');
      }
      const result = await analyzeVideoFrame(video.id, video.thumbnailUrl || '');
      setAnalysis(result.analysis);
    } catch (error) {
      console.error('Error analyzing video:', error);
      // Handle error (show toast, alert, etc.)
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="video-card">
      {/* Video thumbnail and other content */}

      <button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="analyze-button"
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
      </button>

      {analysis && (
        <div className="analysis-results">
          <h3>Technical Analysis</h3>
          <pre>{JSON.stringify(analysis.technical_analysis, null, 2)}</pre>

          <h3>Lighting</h3>
          <pre>{JSON.stringify(analysis.lighting_analysis, null, 2)}</pre>

          <h3>Color Grading</h3>
          <pre>{JSON.stringify(analysis.color_analysis, null, 2)}</pre>

          <h3>Composition</h3>
          <pre>{JSON.stringify(analysis.composition_analysis, null, 2)}</pre>

          <h3>Equipment Used</h3>
          <ul>
            {analysis.equipment_estimates.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>

          <h3>Recommendations</h3>
          <ul>
            {analysis.recommendations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}; 