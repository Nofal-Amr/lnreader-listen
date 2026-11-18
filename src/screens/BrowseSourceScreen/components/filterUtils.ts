import {
  FilterToValues,
  FilterTypes,
  Filters,
  isFilterValue,
  ValueOfFilter,
} from '@plugins/types/filterTypes';

export const getValueFor = <T extends FilterTypes>(
  filter: Filters[string],
  value: FilterToValues<Filters>[string],
): ValueOfFilter<T> =>
  (isFilterValue(value, filter.type)
    ? value.value
    : filter.value) as ValueOfFilter<T>;
