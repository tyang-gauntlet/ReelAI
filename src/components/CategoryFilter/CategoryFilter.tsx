import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { defaultCategories, Category } from '../../services/categoryService';

interface CategoryFilterProps {
  selectedCategory?: string;
  onSelectCategory: (categoryId: string | undefined) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ selectedCategory, onSelectCategory }) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
    >
      <TouchableOpacity
        style={[
          styles.categoryButton,
          !selectedCategory && styles.selectedButton
        ]}
        onPress={() => onSelectCategory(undefined)}
      >
        <Text style={[
          styles.categoryText,
          !selectedCategory && styles.selectedText
        ]}>
          All
        </Text>
      </TouchableOpacity>

      {defaultCategories.map((category) => (
        <TouchableOpacity
          key={category.id}
          style={[
            styles.categoryButton,
            selectedCategory === category.id && styles.selectedButton
          ]}
          onPress={() => onSelectCategory(category.id)}
        >
          <Text style={[
            styles.categoryText,
            selectedCategory === category.id && styles.selectedText
          ]}>
            {category.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 5,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(51, 51, 51, 0.8)',
  },
  selectedButton: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
  },
  categoryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  selectedText: {
    color: '#FFF',
    fontWeight: '600',
  },
});

export default CategoryFilter; 