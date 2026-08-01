let customerCursorRevision = 0;

export const getCustomerCursorRevision = () => customerCursorRevision;

export const invalidateCustomerCursors = () => {
  customerCursorRevision += 1;
};
