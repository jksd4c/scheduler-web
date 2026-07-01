export function parseDoctorNames(input: string) {
  const seen = new Set<string>();
  return input
    .split(/[\s,，、;；]+/g)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      if (seen.has(name)) {
        return false;
      }
      seen.add(name);
      return true;
    });
}

export function mergeDoctorNameLists(residentInput: string, internInput: string) {
  const residents = parseDoctorNames(residentInput);
  const residentSet = new Set(residents);
  const interns = parseDoctorNames(internInput).filter((name) => !residentSet.has(name));

  return { residents, interns };
}
