import { Activity, Gauge } from "lucide-react";
import { FilterLiveForm, useTranslate } from "ra-core";

import { SearchInput } from "@/components/admin/search-input";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";

import { FilterCategory } from "../filters/FilterCategory";
import { CUSTOMER_GRADES, CUSTOMER_STATUSES } from "./customerContract";

export const CompanyListFilter = () => {
  const translate = useTranslate();

  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-4 sm:flex sm:w-52 sm:min-w-52 sm:flex-col sm:gap-8">
      <div className="col-span-2">
        <FilterLiveForm>
          <SearchInput source="q" />
        </FilterLiveForm>
      </div>

      <FilterCategory
        icon={<Gauge className="h-4 w-4" />}
        label="resources.companies.fields.grade"
      >
        {CUSTOMER_GRADES.map((grade) => (
          <ToggleFilterButton
            className="w-full justify-between"
            label={grade}
            key={grade}
            value={{ grade }}
          />
        ))}
      </FilterCategory>

      <FilterCategory
        icon={<Activity className="h-4 w-4" />}
        label="resources.companies.fields.status"
      >
        {CUSTOMER_STATUSES.map((status) => (
          <ToggleFilterButton
            className="w-full justify-between"
            label={translate(`resources.companies.statuses.${status}`)}
            key={status}
            value={{ status }}
          />
        ))}
      </FilterCategory>
    </div>
  );
};
