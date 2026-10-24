using System;
using System.Text;

namespace CobLink.Business.Text
{
    /// <summary>Turns enum member names into readable text for messages and system notes.</summary>
    public static class EnumText
    {
        public static string Humanize(Enum value)
        {
            string name = value.ToString();
            if (name == "Eft")
            {
                return "EFT";
            }

            var text = new StringBuilder(name.Length + 4);
            for (int i = 0; i < name.Length; i++)
            {
                char c = name[i];
                if (i == 0)
                {
                    text.Append(c);
                }
                else if (char.IsUpper(c))
                {
                    text.Append(' ').Append(char.ToLowerInvariant(c));
                }
                else
                {
                    text.Append(c);
                }
            }

            return text.ToString();
        }
    }
}
