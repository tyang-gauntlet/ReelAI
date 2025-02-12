import React, { useState } from 'react';
import { View, Modal, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../styles/theme';

interface HighlightedTerm {
  term: string;
  definition: string;
  category: string;
  confidence?: number;
  alternatives?: { species: string; confidence: number }[];
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
            <View style={styles.overlay}>
              <View style={styles.termDefinitionContainer}>
                <View style={styles.termDefinitionHeader}>
                  <Text style={styles.termTitle}>{selectedTerm.term}</Text>
                  <TouchableOpacity onPress={() => setSelectedTerm(null)}>
                    <Ionicons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.termDefinition}>{selectedTerm.definition}</Text>
                {selectedTerm.confidence && (
                  <Text style={styles.termConfidence}>Confidence: {selectedTerm.confidence}%</Text>
                )}
                {selectedTerm.alternatives && (
                  <View style={styles.alternativesContainer}>
                    <Text style={styles.alternativesTitle}>Other possibilities:</Text>
                    {selectedTerm.alternatives.map((alt, index) => (
                      <Text key={index} style={styles.alternativeItem}>
                        • {alt.species}: {alt.confidence}%
                        {alt.reasoning && (
                          <Text style={styles.reasoningText}>{'\n  '}{alt.reasoning}</Text>
                        )}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  termDefinitionContainer: {
    backgroundColor: '#000',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    width: '90%',
    maxWidth: 350,
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
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  alternativesTitle: {
    fontSize: theme.typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: theme.spacing.xs,
  },
  alternativeItem: {
    fontSize: theme.typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 2,
  },
  reasoningText: {
    fontSize: theme.typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'italic',
  },
}); 