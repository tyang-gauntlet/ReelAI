import React, { useState, useCallback } from 'react';
import { View, Modal, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, LayoutChangeEvent, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../styles/theme';

interface QAPair {
  question: string;
  answer: string;
}

interface HighlightedTerm {
  term: string;
  definition: string;
  category: string;
  confidence?: number;
  alternatives?: { species: string; confidence: number }[];
  qa_pairs?: QAPair[];
}

interface AIAnalysis {
  text: string;
  highlights: HighlightedTerm[];
}

interface AIAnalysisModalProps {
  visible: boolean;
  onClose: () => void;
  analysis: AIAnalysis | null;
  currentTime: number;
}

interface TermPosition {
  x: number;
  y: number;
  width: number;
}

const HighlightedText: React.FC<{
  analysis: AIAnalysis;
  onTermPress: (term: HighlightedTerm) => void;
}> = ({ analysis, onTermPress }) => {
  if (!analysis?.text) {
    return <Text style={styles.fieldValue}>No content available</Text>;
  }

  const parts = analysis.text.split(/(\[[^\]]+\])/g);

  // Debug log to check all terms and their matches
  console.log('Available highlights:', analysis.highlights.map(h => h.term));

  return (
    <Text style={styles.fieldValue}>
      {parts.map((part, index) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          const term = part.slice(1, -1);
          const highlightInfo = analysis.highlights.find(h =>
            h.term.toLowerCase() === term.toLowerCase() || // Case insensitive match
            h.term.includes(term) || // Partial match
            term.includes(h.term)    // Reverse partial match
          );

          // Debug log for unmatched terms
          if (!highlightInfo) {
            console.log('Unmatched term:', term);
          }

          if (highlightInfo) {
            return (
              <Text
                key={index}
                style={styles.highlightedTerm}
                onPress={() => onTermPress(highlightInfo)}
              >
                {term}
              </Text>
            );
          }
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
};

const generateQuestionsFromContent = (term: HighlightedTerm): QAPair[] => {
  const questions: QAPair[] = [];
  const definition = term.definition;
  const termName = term.term;
  const category = term.category.toLowerCase();

  // Extract key concepts from the definition
  const words = definition.toLowerCase().split(' ');
  const keyWords = words.filter(word =>
    word.length > 5 &&
    !['about', 'these', 'those', 'which', 'where', 'their', 'there'].includes(word)
  ).slice(0, 3);

  // Generate base question about the definition
  questions.push({
    question: `What exactly is ${termName}?`,
    answer: `${definition} This ${category} is particularly noteworthy in wildlife studies.`
  });

  // Generate questions based on extracted keywords
  keyWords.forEach(keyword => {
    const questionTemplates = [
      {
        q: `How does ${termName} relate to ${keyword}?`,
        a: `${termName} is closely connected to ${keyword} as part of its ${category} characteristics. This relationship helps us understand its role in the natural environment.`
      },
      {
        q: `Why is the ${keyword} aspect significant?`,
        a: `The ${keyword} aspect of ${termName} is crucial because it reveals important information about how this ${category} functions in nature.`
      }
    ];

    // Add a random question template for each keyword
    const template = questionTemplates[Math.floor(Math.random() * questionTemplates.length)];
    questions.push({
      question: template.q,
      answer: template.a
    });
  });

  // Add category-specific dynamic question
  type CategoryType = 'species' | 'behavior' | 'habitat' | 'morphology';

  const categoryQuestions: Record<CategoryType, { q: string; a: string }> = {
    species: {
      q: `What conservation efforts are important for ${termName}?`,
      a: `Conservation of ${termName} involves understanding its habitat requirements, population dynamics, and the threats it faces. ${term.confidence ? `Our AI system's ${term.confidence}% confidence in identification helps track and monitor this species effectively.` : ''}`
    },
    behavior: {
      q: `When and why does ${termName} occur?`,
      a: `${termName} is a behavior that typically occurs under specific environmental or social conditions, playing a vital role in the species' survival and success.`
    },
    habitat: {
      q: `What makes ${termName} essential for wildlife?`,
      a: `${termName} provides crucial resources and conditions that support various species. It's a vital component of the ecosystem that needs to be preserved.`
    },
    morphology: {
      q: `How does ${termName} benefit the species?`,
      a: `${termName} provides specific advantages to the species, likely evolved through natural selection to enhance survival and reproduction.`
    }
  };

  const categoryKey = category as CategoryType;
  if (categoryQuestions[categoryKey]) {
    questions.push({
      question: categoryQuestions[categoryKey].q,
      answer: categoryQuestions[categoryKey].a
    });
  }

  // Add a forward-looking question
  questions.push({
    question: `What future research about ${termName} would be valuable?`,
    answer: `Future research on ${termName} could focus on understanding its adaptation to environmental changes, its broader ecological impacts, and developing better conservation strategies.`
  });

  return questions;
};

const TermQASection: React.FC<{
  term: HighlightedTerm;
  onClose: () => void;
}> = ({ term, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [qaPairs, setQAPairs] = useState<QAPair[]>([]);
  const [showQA, setShowQA] = useState(false);

  const generateQA = useCallback(async () => {
    setIsLoading(true);
    try {
      const generatedQA = generateQuestionsFromContent(term);
      setQAPairs(generatedQA);
    } catch (error) {
      console.error('Error generating Q&A:', error);
    } finally {
      setIsLoading(false);
    }
  }, [term]);

  return (
    <View style={[
      styles.qaContainer,
      !showQA && styles.qaContainerCollapsed
    ]}>
      {!showQA ? (
        <TouchableOpacity
          style={styles.moreInfoButton}
          onPress={() => {
            setShowQA(true);
            generateQA();
          }}
        >
          <Ionicons name="information-circle" size={24} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={styles.qaContent}>
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.qaTitle}>Frequently Asked Questions</Text>
              {qaPairs.map((qa, index) => (
                <View key={index} style={styles.qaPair}>
                  <Text style={styles.question}>{qa.question}</Text>
                  <Text style={styles.answer}>{qa.answer}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
};

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
  visible,
  onClose,
  analysis,
  currentTime,
}) => {
  const [selectedTerm, setSelectedTerm] = useState<HighlightedTerm | null>(null);
  const [modalDimensions, setModalDimensions] = useState<{ width: number; height: number } | null>(null);

  const handleTermPress = (term: HighlightedTerm) => {
    setSelectedTerm(term);
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setModalDimensions({ width, height });
  };

  if (!analysis) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent} onLayout={handleLayout}>
          <View style={styles.header}>
            <Text style={styles.title}>AI Analysis</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView}>
            <HighlightedText
              analysis={analysis}
              onTermPress={handleTermPress}
            />
          </ScrollView>

          {selectedTerm && (
            <Modal
              visible={!!selectedTerm}
              transparent
              animationType="fade"
              onRequestClose={() => setSelectedTerm(null)}
            >
              <View style={styles.termModalContainer}>
                <View style={styles.termDefinitionContainer}>
                  <View style={styles.termDefinitionHeader}>
                    <Text style={styles.termTitle}>{selectedTerm.term}</Text>
                    <TouchableOpacity onPress={() => setSelectedTerm(null)}>
                      <Ionicons name="close" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={styles.termScrollView} contentContainerStyle={styles.termScrollContent}>
                    <Text style={styles.termDefinition}>{selectedTerm.definition}</Text>
                    {selectedTerm.confidence && (
                      <Text style={styles.termConfidence}>Confidence: {selectedTerm.confidence}%</Text>
                    )}
                    {(selectedTerm.alternatives && selectedTerm.alternatives.length > 0) && (
                      <View style={styles.alternativesContainer}>
                        <Text style={styles.alternativesTitle}>Other possibilities:</Text>
                        {selectedTerm.alternatives.map((alt, index) => (
                          <View key={index} style={styles.alternativeItemContainer}>
                            <Text style={styles.alternativeItem}>
                              • {alt.species || `Alternative ${selectedTerm.category}`}
                            </Text>
                            <Text style={styles.alternativeConfidence}>
                              {alt.confidence}% match with {selectedTerm.term}
                            </Text>
                            <Text style={styles.alternativeDescription}>
                              This could be another potential {selectedTerm.category} based on similar characteristics observed in the video.
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <TermQASection term={selectedTerm} onClose={() => setSelectedTerm(null)} />
                  </ScrollView>
                </View>
              </View>
            </Modal>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 34 : theme.spacing.md,
    maxHeight: '80%',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text.primary,
  },
  closeButton: {
    padding: theme.spacing.sm,
  },
  scrollView: {
    padding: theme.spacing.lg,
  },
  fieldValue: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  highlightedTerm: {
    textDecorationLine: 'underline',
    color: theme.colors.text.primary,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  termModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: '30%',
  },
  termDefinitionContainer: {
    backgroundColor: '#000',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  termDefinitionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  termTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: '#fff',
  },
  termDefinition: {
    fontSize: theme.typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: theme.spacing.xs,
  },
  termConfidence: {
    fontSize: theme.typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: theme.spacing.xs,
  },
  alternativesContainer: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  alternativesTitle: {
    fontSize: theme.typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: theme.spacing.xs,
  },
  alternativeItemContainer: {
    marginBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.xs,
  },
  alternativeItem: {
    fontSize: theme.typography.sizes.sm,
    color: '#fff',
    fontWeight: theme.typography.weights.medium,
  },
  alternativeConfidence: {
    fontSize: theme.typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  alternativeDescription: {
    fontSize: theme.typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  reasoningText: {
    fontSize: theme.typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'italic',
  },
  qaContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: theme.spacing.md,
  },
  qaContainerCollapsed: {
    borderTopWidth: 0,
    marginTop: 0,
    paddingTop: 0,
    height: 40, // Just enough for the icon
  },
  moreInfoButton: {
    alignSelf: 'flex-end',
    padding: theme.spacing.xs,
  },
  qaContent: {
    marginTop: theme.spacing.sm,
  },
  qaTitle: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    color: '#fff',
    marginBottom: theme.spacing.sm,
  },
  qaPair: {
    marginBottom: theme.spacing.md,
  },
  question: {
    fontSize: theme.typography.sizes.sm,
    color: '#fff',
    fontWeight: theme.typography.weights.medium,
    marginBottom: theme.spacing.xs,
  },
  answer: {
    fontSize: theme.typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  termScrollView: {
    flexGrow: 0,
  },
  termScrollContent: {
    flexGrow: 0,
  },
}); 