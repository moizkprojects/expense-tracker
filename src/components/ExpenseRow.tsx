import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../constants/colors";
import { ExpenseRowInput } from "../types";

type Props = {
  row: ExpenseRowInput;
  onChange: (next: ExpenseRowInput) => void;
  onRemove: () => void;
  removable: boolean;
};

export const ExpenseRow = ({ row, onChange, onRemove, removable }: Props) => (
  <View style={styles.row}>
    <TextInput
      style={[styles.input, styles.nameInput]}
      placeholder="Expense name"
      value={row.name}
      onChangeText={(text) => onChange({ ...row, name: text })}
      placeholderTextColor="#8F8F8F"
    />
    <TextInput
      style={[styles.input, styles.amountInput]}
      placeholder="0.00"
      value={row.amount}
      keyboardType="decimal-pad"
      onChangeText={(text) => onChange({ ...row, amount: text })}
      placeholderTextColor="#8F8F8F"
    />
    {removable ? (
      <Pressable style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeBtnText}>Remove</Text>
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    marginBottom: 10,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: colors.text,
  },
  nameInput: {},
  amountInput: {},
  removeBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FCEAEA",
  },
  removeBtnText: {
    color: colors.bad,
    fontWeight: "600",
    fontSize: 12,
  },
});
