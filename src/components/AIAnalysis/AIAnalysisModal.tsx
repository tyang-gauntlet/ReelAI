import React from 'react';
import { View, Modal, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../styles/theme';

interface AIAnalysis {
  description: string;
  species: {
    identification: string;
    classification: string;
    conservationStatus: string;
  };
  behavior: {
    activity: string;
    socialInteraction: string;
    habitatUse: string;
  };
  environment: {
    habitat: string;
    timeOfDay: string;
    weatherConditions: string;
    ecosystem: string;
  };
  physicalCharacteristics: {
    appearance: string;
    adaptations: string;
    lifecycle: string;
  };
  ecology: {
    dietaryHabits: string;
    roleInEcosystem: string;
    interactions: string;
  };
  conservation: {
    threats: string;
    protectionStatus: string;
    populationTrends: string;
  };
  scientificSignificance: string;
}

interface AIAnalysisModalProps {
  visible: boolean;
  onClose: () => void;
  analysis: AIAnalysis | null;
}

const renderValue = (value: any): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).join('\n\n');
  }
  return '';
};

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
  visible,
  onClose,
  analysis,
}) => {
  if (!analysis) return null;

  const analysisFields = [
    { label: 'Description', value: analysis.description },
    { label: 'Species Information', value: analysis.species },
    { label: 'Behavioral Analysis', value: analysis.behavior },
    { label: 'Environmental Context', value: analysis.environment },
    { label: 'Physical Characteristics', value: analysis.physicalCharacteristics },
    { label: 'Ecological Analysis', value: analysis.ecology },
    { label: 'Conservation Status', value: analysis.conservation },
    { label: 'Scientific Significance', value: analysis.scientificSignificance },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>AI Analysis</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView}>
            {analysisFields.map((field, index) => (
              <View key={index} style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <Text style={styles.fieldValue}>{renderValue(field.value)}</Text>
              </View>
            ))}
          </ScrollView>
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
  fieldContainer: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.typography.sizes.md,
    fontWeight: 'bold',
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
  },
  fieldValue: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
}); 